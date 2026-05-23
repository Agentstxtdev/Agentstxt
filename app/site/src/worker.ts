import { Mppx, tempo, stripe } from 'mppx/server';
import Stripe from 'stripe';

interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  ASSETS: Fetcher;
  MCP?:  { fetch: typeof fetch };
  AUTH?: { fetch: typeof fetch };
  // Solana wallet (Associated Token Account for USDC) used as `payTo` in the
  // synthetic /x402 demo endpoint. Same env var name as herald's config so a
  // single value drives both the announcement (agents.json) and the wire (402).
  SOLANA_ADDRESS?: string;
  // MPP — set via `wrangler secret put` or `.dev.vars`. Each protocol path on
  // /mpp activates independently: Tempo when TREASURY_TEMPO is set, Stripe when
  // both STRIPE_SECRET_KEY and STRIPE_NETWORK_ID are set. Absent both → 503.
  TREASURY_TEMPO?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_NETWORK_ID?: string;
  MPP_SECRET_KEY?: string;
  // Per-IP rate limiter for /x402 and /mpp. Optional so local dev without the
  // binding still boots; absence is a no-op. Both demo routes call out to
  // third-party facilitators (x402.org, Stripe, Tempo) on the hot path, so
  // throttling here also protects those upstream dependencies from a runaway
  // client looping the demo.
  RL_DEMO?: RateLimitBinding;
  // /audit cache. Reuses the existing SESSION KV namespace under an `audit:`
  // key prefix; results are cached by (target_url, hour-bucket) for ~1 hour
  // so popular targets only hit the MCP audit endpoint once per hour.
  // Optional so local dev without a real KV binding still boots (cache reads
  // return null, cache writes are skipped).
  SESSION?: KVNamespace;
}


const MCP_PREFIXES  = ['/mcp', '/sse'];
// The auth worker speaks two protocols in parallel: agent-auth (Ed25519 + JWT,
// discovery at /.well-known/agent-configuration) and OAuth 2.0 (client-
// credentials grant, discovery at the standard RFC 8414 / OIDC paths). Both
// live on the same worker; the site worker proxies every prefix they own so
// agents.txt's `Authorization:` block can advertise either or both.
const AUTH_PREFIXES = [
  '/.well-known/agent-configuration',
  '/.well-known/openid-configuration',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/jwks.json',
  '/agent/',
  '/capability/',
  '/oauth/',
  '/auth',
];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(p =>
    pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/')
  );
}

function proxyTo(request: Request, binding: { fetch: typeof fetch }): Promise<Response> {
  const url = new URL(request.url);
  const fwd = new Headers(request.headers);
  if (url.search) fwd.set('x-original-query', url.search);
  return binding.fetch(new Request(request.url, {
    method:  request.method,
    headers: fwd,
    body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  }));
}

// /x402 is a synthetic gated resource that exists for one purpose: demonstrate
// the x402 v2 wire shape. agents.json never advertises this path; the spec
// does not have a "go pay here" route. Production sites gate the resources the
// agent actually wants, and the 402 appears on first contact with the resource.
// For agents-txt.com there is no real gated resource (the spec and docs are
// free), so we fabricate one route and label it as a demo.

const SOLANA_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_USDC    = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_AMOUNT    = '10000'; // 0.01 USDC (6 decimals)
const TEST_DESCRIPTION = 'agents.txt x402 demo charge (0.01 USDC).';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Payment, Payment-Signature',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'X-Payment-Response, Payment-Receipt, WWW-Authenticate',
};

// RFC 9598 RateLimit header field set advertised on rate-limited routes.
// Cloudflare's `limit()` API does not expose remaining quota, so the
// `RateLimit-Remaining` value we report is an approximation: on a 429 it
// reads zero, on success it reads the static limit. Agents that respect
// `RateLimit-Policy` self-throttle to the published window without needing
// per-request accuracy.
const RL_LIMIT  = 30;
const RL_WINDOW = 60;
const RL_POLICY = `"audit"; q=${RL_LIMIT}; w=${RL_WINDOW}`;
const rateLimitHeaders = (remaining: number, reset: number): Record<string, string> => ({
  'RateLimit-Limit':     String(RL_LIMIT),
  'RateLimit-Remaining': String(Math.max(0, remaining)),
  'RateLimit-Reset':     String(Math.max(0, reset)),
  'RateLimit-Policy':    RL_POLICY,
});

/**
 * Per-IP, per-route rate-limit gate. Returns a 429 Response when over budget,
 * null otherwise. CF-Connecting-IP is set by Cloudflare's edge and cannot be
 * spoofed by the client; the 'unknown' fallback covers local dev only.
 */
async function enforceRateLimit(request: Request, env: Env, route: string): Promise<Response | null> {
  if (!env.RL_DEMO) return null;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.RL_DEMO.limit({ key: `${ip}:${route}` });
  if (success) return null;
  return new Response(
    JSON.stringify({ error: 'rate_limited', message: 'Too many requests. Slow down and retry shortly.' }),
    {
      status: 429,
      headers: {
        'Content-Type':  'application/json',
        'Retry-After':   String(RL_WINDOW),
        ...rateLimitHeaders(0, RL_WINDOW),
        ...CORS,
      },
    },
  );
}

// ── /audit helpers ──────────────────────────────────────────────────────────
//
// Architecture: the audit logic lives in the MCP worker (runAudit in
// mcp/src/tools/audit_site.ts) so there is one source of truth for spec rules
// shared between the MCP tool surface and this HTTP surface. The site worker
// orchestrates: validate input, rate-limit, look up cache, call the MCP
// worker's plain-HTTP /api/audit endpoint via the service binding, cache the
// result, and content-negotiate the response (JSON / Markdown / HTML).
//
// Cache strategy: keyed by sha256(target_url) + hour-bucket, TTL 1 hour.
// Same target audited twice in the same hour hits warm. A new hour starts
// fresh so spec compliance can be re-verified.

type AuditReport = Record<string, unknown>;
type AuditEnvelope =
  | { ok: true;  target: string; cached: boolean; fetchedAt: string; report: AuditReport }
  | { ok: false; target: string; error: string; message: string };

const AUDIT_TTL_SECONDS = 3600;

/**
 * Normalise a user-typed target. Allow bare hostnames ("example.com"), promote
 * to https://, reject anything that does not parse as http(s). Returns the
 * canonical absolute URL on success, null on failure.
 */
function normaliseAuditTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // Strip path and query; the audit always runs against the origin.
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Inspect an audit report and decide whether it is "successful enough" to
 * cache. The agents.txt spec audit is per-file: the report can have rich
 * content with real validation findings even when one file is missing
 * (legitimately a 404). But when the upstream fetch never reached the target
 * — Cloudflare edge timeout (522), DNS failure (status 0), or any 5xx —
 * those statuses indicate the audit could not run, not that the target site
 * failed compliance. Storing such results poisons the cache for an hour.
 *
 * Rule: if any of the three audited files came back with status 0 (network
 * error / abort) or status >= 500 (upstream couldn't serve), the result is
 * a transient infrastructure failure and must NOT be cached. A 404 on
 * agents.json, by contrast, is a real and stable finding and gets cached
 * normally.
 */
function isReportCacheable(report: AuditReport): boolean {
  const sections = ['agentsTxt', 'agentsJson', 'robotsTxt'] as const;
  for (const key of sections) {
    const block = report[key] as { status?: number } | undefined;
    const status = block?.status;
    if (typeof status === 'number' && (status === 0 || status >= 500)) {
      return false;
    }
  }
  return true;
}

/**
 * Call the MCP worker's /api/audit endpoint via the service binding, caching
 * the result in KV for AUDIT_TTL_SECONDS. Returns the audit envelope ready
 * to embed in the response. The `cached` flag distinguishes warm KV hits
 * from fresh upstream calls so the page can show a small "cached" badge.
 *
 * `bypassCache: true` skips the KV read but still writes the fresh result
 * back (when cacheable). Used by the `?nocache=1` query-string flag so a
 * caller who knows the cached version is stale can force a re-fetch without
 * waiting for the hour bucket to roll over.
 */
async function runAuditCached(
  env: Env,
  target: string,
  options: { bypassCache?: boolean } = {},
): Promise<AuditEnvelope> {
  const now = Date.now();
  const hourBucket = Math.floor(now / (AUDIT_TTL_SECONDS * 1000));
  const targetHash = await sha256Hex(target);
  const cacheKey = `audit:${targetHash}:${hourBucket}`;

  if (env.SESSION && !options.bypassCache) {
    const cached = await env.SESSION.get(cacheKey, 'json') as AuditReport | null;
    if (cached) {
      return { ok: true, target, cached: true, fetchedAt: new Date(hourBucket * AUDIT_TTL_SECONDS * 1000).toISOString(), report: cached };
    }
  }

  if (!env.MCP) {
    return { ok: false, target, error: 'mcp_unavailable', message: 'MCP service binding is not configured on this deployment.' };
  }

  // Service binding fetch: the hostname is ignored by the binding; the path
  // must match the MCP worker's /api/audit handler in mcp/src/index.ts.
  const upstream = await env.MCP.fetch(`https://mcp/api/audit?url=${encodeURIComponent(target)}`);
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return { ok: false, target, error: 'audit_failed', message: `Upstream audit returned ${upstream.status}. ${text.slice(0, 200)}` };
  }
  const report = await upstream.json() as AuditReport;

  if (env.SESSION && isReportCacheable(report)) {
    // Fire-and-forget; cache misses are not load-bearing.
    await env.SESSION.put(cacheKey, JSON.stringify(report), { expirationTtl: AUDIT_TTL_SECONDS }).catch(() => {});
  }

  return { ok: true, target, cached: false, fetchedAt: new Date(now).toISOString(), report };
}

/**
 * Stringify an envelope safely for inline injection into a `<script
 * type="application/json">` tag. The only escape we need is the
 * `</script` sequence: a stored error message containing it would terminate
 * the script tag prematurely. JSON.stringify's normal output is otherwise
 * already safe to embed inside script tags.
 */
function safeJsonForScriptTag(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

/**
 * Render the audit envelope as Markdown. Mirrors the structure of the JSON
 * report, with one section per audited file and a summary line at the top.
 * Designed to be readable by humans and by LLMs that fetch the URL with
 * `Accept: text/markdown` and want to summarise or quote the result.
 */
function renderAuditMarkdown(envelope: AuditEnvelope): string {
  if (!envelope.ok) {
    return `# agents.txt audit\n\n**Error**: \`${envelope.error}\`\n\n${envelope.message}\n`;
  }
  const r = envelope.report;
  const summary = r.summary as { compliant?: boolean; errorCount?: number; warningCount?: number } | undefined;
  const status = summary?.compliant ? 'PASS' : 'FAIL';
  const lines: string[] = [];
  lines.push(`# agents.txt audit · ${envelope.target}`);
  lines.push('');
  lines.push(`**Status**: ${status} · ${summary?.errorCount ?? 0} errors · ${summary?.warningCount ?? 0} warnings`);
  if (envelope.cached) lines.push('');
  if (envelope.cached) lines.push(`*Cached result from ${envelope.fetchedAt}.*`);
  lines.push('');

  const section = (heading: string, block: unknown) => {
    if (!block || typeof block !== 'object') return;
    const b = block as Record<string, unknown>;
    lines.push(`## ${heading}`);
    if ('found' in b) lines.push(`Served: ${b.found ? 'yes' : 'no'}${typeof b.status === 'number' ? ` · HTTP ${b.status}` : ''}`);
    const v = b.validation as { errors?: string[]; warnings?: string[] } | undefined;
    if (v?.errors?.length) {
      lines.push('');
      lines.push('### Errors');
      v.errors.forEach(e => lines.push(`- ${e}`));
    }
    if (v?.warnings?.length) {
      lines.push('');
      lines.push('### Warnings');
      v.warnings.forEach(w => lines.push(`- ${w}`));
    }
    lines.push('');
  };
  section('/agents.txt',  r.agentsTxt);
  section('/agents.json', r.agentsJson);
  section('/robots.txt',  r.robotsTxt);

  const c = r.consistency as { valid?: boolean; issues?: string[]; note?: string } | undefined;
  if (c) {
    lines.push('## Cross-file consistency');
    if (c.valid) {
      lines.push('Consistent.');
    } else if (c.issues?.length) {
      lines.push('Inconsistencies:');
      c.issues.forEach(i => lines.push(`- ${i}`));
    } else if (c.note) {
      lines.push(c.note);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Serve the static Astro shell for /audit/ from ASSETS, splicing the audit
 * envelope into its `<script id="audit-data">` placeholder. The page's
 * inline script reads that element on load and renders the result. This is
 * the "(a)" architecture: zero-flicker, no client-side fetch round trip.
 */
async function renderAuditHtml(request: Request, env: Env, envelope: AuditEnvelope): Promise<Response> {
  const shellRequest = new Request(new URL('/audit/', request.url));
  const shell = await env.ASSETS.fetch(shellRequest);
  if (!shell.ok) {
    // Page not built? Fall back to the JSON form so the caller still gets
    // something useful, with a hint about the misconfiguration.
    return Response.json({ ...envelope, _shell_error: shell.status }, { status: 500, headers: CORS });
  }
  const html = await shell.text();
  const replaced = html.replace(
    /<script id="audit-data" type="application\/json">[^<]*<\/script>/,
    `<script id="audit-data" type="application/json">${safeJsonForScriptTag(envelope)}</script>`,
  );
  return new Response(replaced, {
    status: 200,
    headers: {
      'Content-Type':                'text/html; charset=utf-8',
      'Cache-Control':               'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// /mpp is the MPP-protocol equivalent of /x402: a synthetic gated resource
// whose only purpose is to demonstrate the MPP wire shape. agents.json never
// advertises this path; the spec does not have a "go pay here" route. The
// recipient (Tempo wallet or Stripe Business Network profile) is carried in
// the WWW-Authenticate: Payment challenge per the mppx SDK, never in any
// discovery file. Keeping x402 and MPP on separate routes makes the demos
// independently readable; a real site can choose to combine them on one route.

const TEMPO_USDC_E = '0x20c0000000000000000000000000000000000000'; // USDC.e on Tempo mainnet
// Major-unit decimal. 0.01 is the minimum that survives Stripe's 1-cent
// precision floor (0.001 USD × 10² = 0.1 → 0). Also matches the announced
// payments.pricing.amount in agents.json, so announcement and wire agree.
const MPP_TEST_AMOUNT = '0.01';
const MPP_TEST_DESCRIPTION = 'agents.txt MPP demo charge (0.01 USDC / USD).';

// Parse a WWW-Authenticate: Payment header (RFC 7235 multi-challenge form) into
// an array of structured challenge objects, decoding the base64 `request` blob
// into JSON when present. The raw header value remains the canonical wire form
// for agents per spec §8.2; this structured array is emitted alongside it in
// the JSON body for demo readability only.
function parseMppChallenges(headerValue: string | null | undefined): Array<Record<string, unknown>> {
  if (!headerValue) return [];
  const pieces = headerValue.split(/,\s*Payment\s+/i);
  pieces[0] = pieces[0].replace(/^Payment\s+/i, '');
  return pieces.map(piece => {
    const params: Record<string, unknown> = {};
    const re = /(\w+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(piece)) !== null) {
      const [, key, value] = m;
      if (key === 'request') {
        try { params.request = JSON.parse(atob(value)); } catch { params.request = value; }
      } else {
        params[key] = value;
      }
    }
    return params;
  });
}

type MppxStatus =
  | { ok: true; mppx: ReturnType<typeof Mppx.create> }
  | { ok: false; reason: string };

// Not cached at module scope. Cloudflare reuses isolates across requests, so a
// 503 captured before secrets propagated would stick until the isolate cycled.
// Mppx.create is cheap; re-run on each gated request.
function getMppx(env: Env): MppxStatus {
  const tempoRecipient = env.TREASURY_TEMPO;
  const hasStripe = !!(env.STRIPE_SECRET_KEY && env.STRIPE_NETWORK_ID);
  if (!tempoRecipient && !hasStripe) {
    return { ok: false, reason: 'No MPP method credentials configured. Set TREASURY_TEMPO (Tempo) and/or STRIPE_SECRET_KEY + STRIPE_NETWORK_ID (Stripe), then restart dev.' };
  }
  if (!env.MPP_SECRET_KEY) {
    return { ok: false, reason: 'MPP_SECRET_KEY is required by mppx to sign receipts. Set it in .dev.vars (any random string for dev), then restart dev.' };
  }

  const methods: Parameters<typeof Mppx.create>[0]['methods'] = [];
  if (tempoRecipient) {
    methods.push(tempo.charge({ currency: TEMPO_USDC_E, recipient: tempoRecipient, testnet: false }));
  }
  if (hasStripe) {
    const stripeClient = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-04.preview' as never });
    methods.push(stripe.charge({
      client: stripeClient,
      networkId: env.STRIPE_NETWORK_ID!,
      paymentMethodTypes: ['card', 'link'],
    }));
  }

  try {
    const mppx = Mppx.create({ methods, secretKey: env.MPP_SECRET_KEY, realm: 'agents.txt' });
    return { ok: true, mppx };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `mppx initialization failed: ${msg}` };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (env.MCP  && matches(pathname, MCP_PREFIXES))  return proxyTo(request, env.MCP);
    if (env.AUTH && matches(pathname, AUTH_PREFIXES)) return proxyTo(request, env.AUTH);

    // ── /.well-known/mcp: directory-style manifest ───────────────────────────
    // Scanners and clients probe /.well-known/mcp as a directory entry point
    // before walking into /.well-known/mcp/server-card.json. Emit a small
    // pointer document so the bare path returns a useful 200 instead of
    // depending on static-asset 404 / index fallback behaviour. The actual
    // SEP-2127 server card lives at the canonical sub-path and is generated
    // by herald from agentsjson.config.js.
    if (pathname === '/.well-known/mcp') {
      const origin = new URL(request.url).origin;
      // Read the server-card to mirror its `name` / `description` / `version`
      // / `tools[]` on the directory manifest so scanners that only fetch the
      // bare path still see the full identity. One source of truth: herald
      // generates the card from agentsjson.config.js, the manifest just
      // re-projects it.
      let cardData: Record<string, unknown> = {};
      try {
        const cardRes = await env.ASSETS.fetch(new Request(new URL('/.well-known/mcp/server-card.json', request.url)));
        if (cardRes.ok) cardData = await cardRes.json();
      } catch { /* fall through; manifest still useful without tools */ }
      const body = JSON.stringify({
        name:        cardData.name        ?? 'agents.txt',
        description: cardData.description ?? undefined,
        version:     cardData.version     ?? undefined,
        endpoint:    `${origin}/mcp`,
        transport:   'streamable-http',
        serverCard:  `${origin}/.well-known/mcp/server-card.json`,
        agentsTxt:   `${origin}/agents.txt`,
        agentsJson:  `${origin}/agents.json`,
        ...(Array.isArray(cardData.tools) ? { tools: cardData.tools } : {}),
      }, null, 2) + '\n';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type':  'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ...CORS,
        },
      });
    }

    // ── /audit: shareable spec audit for any site ─────────────────────────
    // - GET /audit          (no ?url) → static Astro form page
    // - GET /audit?url=…    → run audit + content-negotiate:
    //     Accept: application/json → JSON envelope
    //     Accept: text/markdown    → Markdown report (LLM-friendly)
    //     default (HTML)           → Astro shell with audit JSON inlined
    //                                  into <script id="audit-data">; the
    //                                  page's client script renders it.
    // The result URL is stable and shareable. The MCP worker's /api/audit
    // does the actual work; the site worker handles rate-limit, KV cache,
    // and presentation.
    if (pathname === '/audit') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      const target = new URL(request.url).searchParams.get('url');
      if (!target) return env.ASSETS.fetch(request);

      const validated = normaliseAuditTarget(target);
      const acceptH = request.headers.get('accept') ?? '';
      const wantsJson = /application\/json/i.test(acceptH);
      const wantsMd   = /text\/markdown/i.test(acceptH);

      // RFC 9598 RateLimit headers attached to every /audit response so
      // agents can self-throttle without hitting a 429 first.
      const rlH = rateLimitHeaders(RL_LIMIT - 1, RL_WINDOW);

      if (!validated) {
        const errEnv: AuditEnvelope = { ok: false, target, error: 'invalid_url', message: `"${target}" is not a valid http(s) URL.` };
        if (wantsJson) return Response.json(errEnv, { status: 400, headers: { ...rlH, ...CORS } });
        if (wantsMd)   return new Response(renderAuditMarkdown(errEnv), { status: 400, headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...rlH, ...CORS } });
        return renderAuditHtml(request, env, errEnv);
      }

      const limited = await enforceRateLimit(request, env, 'audit');
      if (limited) return limited;

      // ?nocache=1 forces a fresh upstream audit, bypassing the KV read but
      // still writing the result back when it is cacheable. Useful after a
      // target has just been redeployed and the operator wants to re-verify
      // without waiting for the hour bucket to roll over.
      const bypassCache = new URL(request.url).searchParams.get('nocache') === '1';
      const envelope = await runAuditCached(env, validated, { bypassCache });

      if (wantsJson) return Response.json(envelope, { headers: { ...rlH, ...CORS } });
      if (wantsMd)   return new Response(renderAuditMarkdown(envelope), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...rlH, ...CORS } });
      return renderAuditHtml(request, env, envelope);
    }

    // Markdown for Agents: when a client sends `Accept: text/markdown` (or the
    // markdown q-value beats text/html), serve /llms-full.txt — the canonical
    // markdown representation of this site already published by the herald
    // generator — with the matching Content-Type. Cloudflare's managed
    // `content_converter` zone setting does the same thing transparently when
    // it rolls out; this worker-side fallback satisfies the same audit check
    // (isitagentready.com → contentAccessibility.markdownNegotiation) and uses
    // content the site already publishes, so it stays an honest declaration.
    //
    // Scoped to HTML page paths only. Protocol routes (/x402, /mpp) and proxied
    // routes were already returned above, but `wrangler.json` sets
    // `assets.run_worker_first: true` to ensure / and other static-asset pages
    // reach this handler. Without the page-path allowlist below we'd shadow
    // future no-extension routes (e.g. /pay or /api/foo) with markdown content.
    const PAGE_PATHS = /^\/(spec|demo(\/[^/]+)?|about|compare)?$/;
    const accept     = request.headers.get('accept') ?? '';
    const url        = new URL(request.url);
    const modeAgent  = url.searchParams.get('mode') === 'agent';
    const isIndexMd  = pathname === '/index.md';

    // Three triggers all collapse to the same markdown branch:
    //   • Accept: text/markdown on an HTML page path (RFC content negotiation)
    //   • ?mode=agent query-string flag (AEO scanner heuristic; some agents
    //     append this rather than setting the header, depending on the runtime
    //     they're hosted in)
    //   • GET /index.md (the optional Markdown URL fallback some scanners
    //     probe for before reading from the homepage)
    // All three serve the canonical /llms-full.txt body with text/markdown,
    // matching what Cloudflare's managed `content_converter` setting will do
    // transparently once it rolls out for this zone.
    const wantsMarkdown =
      request.method === 'GET' &&
      (
        isIndexMd ||
        (modeAgent && PAGE_PATHS.test(pathname)) ||
        (/text\/markdown/i.test(accept) && PAGE_PATHS.test(pathname))
      );
    if (wantsMarkdown) {
      const md = await env.ASSETS.fetch(new Request(new URL('/llms-full.txt', request.url)));
      if (md.ok) {
        return new Response(md.body, {
          status: 200,
          headers: {
            'Content-Type':                'text/markdown; charset=utf-8',
            'Cache-Control':               'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Vary':                        'Accept',
          },
        });
      }
    }

    if (pathname === '/x402') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      const limited = await enforceRateLimit(request, env, 'x402');
      if (limited) return limited;

      const payTo = env.SOLANA_ADDRESS;
      if (!payTo) {
        return new Response(JSON.stringify({
          error: 'endpoint_inactive',
          message: 'No SOLANA_ADDRESS wallet configured. The /x402 demo route is offline on this deployment.',
        }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      const requirements = {
        scheme:  'exact',
        network: SOLANA_NETWORK,
        amount:  TEST_AMOUNT,
        asset:   SOLANA_USDC,
        payTo,
        maxTimeoutSeconds: 60,
        extra: { name: 'USDC', description: TEST_DESCRIPTION },
      };

      const paymentSig = request.headers.get('Payment-Signature') ?? request.headers.get('X-Payment');
      if (paymentSig) {
        let paymentPayload: unknown;
        try {
          paymentPayload = JSON.parse(atob(paymentSig));
        } catch {
          return new Response(JSON.stringify({ error: 'invalid_payment_signature_encoding' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
          });
        }

        const facilRes = await fetch('https://x402.org/facilitator/settle', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements }),
        });

        const result = await facilRes.json() as {
          success?:      boolean;
          transaction?:  string;
          network?:      string;
          payer?:        string;
          errorReason?:  string;
          errorMessage?: string;
        };

        if (!result.success) {
          return new Response(JSON.stringify({
            error:   result.errorReason  ?? 'settlement_failed',
            message: result.errorMessage ?? 'The facilitator rejected the payment.',
          }), { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } });
        }

        const settlement = {
          success:     true,
          transaction: result.transaction!,
          network:     result.network ?? SOLANA_NETWORK,
          payer:       result.payer,
        };
        return new Response(JSON.stringify({
          message:  'Payment verified. agents.txt x402 demo route settled.',
          resource: 'https://agents-txt.com/x402',
          standard: 'https://agents-txt.com',
          ...settlement,
        }), {
          status: 200,
          headers: {
            'Content-Type':       'application/json',
            'X-Payment-Response': btoa(JSON.stringify(settlement)),
            ...CORS,
          },
        });
      }

      return new Response(JSON.stringify({
        x402Version: 2,
        error: 'Payment required',
        resource: {
          url:         'https://agents-txt.com/x402',
          description: 'Synthetic gated route demonstrating the x402 v2 wire shape on Solana. Not a revenue endpoint.',
          mimeType:    'application/json',
        },
        accepts: [requirements],
      }, null, 2), {
        status: 402,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (pathname === '/mpp') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      const limited = await enforceRateLimit(request, env, 'mpp');
      if (limited) return limited;

      const status = getMppx(env);
      if (!status.ok) {
        return new Response(JSON.stringify({
          error: 'endpoint_inactive',
          message: status.reason,
        }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const mppx = status.mppx;

      try {
        const charges = [
          ...(env.TREASURY_TEMPO ? [mppx.tempo.charge({ amount: MPP_TEST_AMOUNT, description: MPP_TEST_DESCRIPTION, recipient: env.TREASURY_TEMPO })] : []),
          ...(env.STRIPE_NETWORK_ID ? [mppx.stripe.charge({ amount: MPP_TEST_AMOUNT, description: MPP_TEST_DESCRIPTION, currency: 'usd', decimals: 2 })] : []),
        ];
        const result = await Mppx.compose(...charges)(request);

        if (request.headers.get('Authorization')?.toLowerCase().startsWith('payment ') && result.status !== 402) {
          return result.withReceipt(new Response(JSON.stringify({
            message:  'Payment verified. agents.txt MPP demo route settled.',
            resource: 'https://agents-txt.com/mpp',
            standard: 'https://agents-txt.com',
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS },
          }));
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...CORS };
        const wwwAuth = result.challenge.headers.get('WWW-Authenticate');
        if (wwwAuth) headers['WWW-Authenticate'] = wwwAuth;
        const challenges = parseMppChallenges(wwwAuth);

        return new Response(JSON.stringify({
          error: 'Payment required',
          resource: {
            url:         'https://agents-txt.com/mpp',
            description: 'Synthetic gated route demonstrating the MPP (Machine Payments Protocol) wire shape. Methods activate per configured credentials.',
            mimeType:    'application/json',
          },
          // The canonical wire form is the WWW-Authenticate: Payment header
          // (RFC 7235 multi-challenge per spec §8.2). This body field is the
          // same data parsed and decoded for human inspection; agents should
          // read the header, not the body.
          mpp: { challenges },
        }, null, 2), {
          status: 402,
          headers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({
          error: 'mpp_runtime_error',
          message: `mppx threw at request time: ${msg}`,
        }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // Static-asset fallback. Wrap the response so any 4xx / 5xx that bubbles
    // up to clients that prefer JSON (Accept: application/json) or that hit
    // an API-shaped path (/api/*, /v1/*, /v2/*) gets an RFC 7807 Problem
    // Details payload instead of Cloudflare's default HTML 404 page. Agents
    // (and AEO scanners) cannot parse the HTML response, so the rewrite
    // turns every unmatched API-like request into a structured error.
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status < 400) return assetRes;
    const acceptH      = request.headers.get('accept') ?? '';
    const wantsJson    = /application\/json/i.test(acceptH) || /application\/problem\+json/i.test(acceptH);
    const apiShaped    = /^\/(api|v\d+)(\/|$)/.test(pathname);
    if (!wantsJson && !apiShaped) return assetRes;
    const problem = {
      type:     `https://agents-txt.com/spec#${assetRes.status}`,
      title:    statusTitle(assetRes.status),
      status:   assetRes.status,
      detail:   problemDetail(assetRes.status, pathname),
      instance: pathname,
      code:     statusCode(assetRes.status),
    };
    return new Response(JSON.stringify(problem, null, 2) + '\n', {
      status: assetRes.status,
      headers: {
        'Content-Type':  'application/problem+json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS,
      },
    });
  },
} satisfies ExportedHandler<Env>;

// ── RFC 7807 helpers ────────────────────────────────────────────────────────
// Map HTTP status to short titles + machine codes + resolution hints. Used by
// the API-shaped 4xx / 5xx rewrite path above so every unmatched API request
// gets a structured Problem Details payload an agent can act on.
function statusTitle(status: number): string {
  if (status === 404) return 'Not Found';
  if (status === 405) return 'Method Not Allowed';
  if (status === 410) return 'Gone';
  if (status === 429) return 'Too Many Requests';
  if (status >= 500) return 'Server Error';
  if (status >= 400) return 'Client Error';
  return 'Error';
}
function statusCode(status: number): string {
  if (status === 404) return 'not_found';
  if (status === 405) return 'method_not_allowed';
  if (status === 410) return 'gone';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'client_error';
}
function problemDetail(status: number, pathname: string): string {
  if (status === 404) {
    return `No resource is served at "${pathname}". agents-txt.com is a specification site, not a per-tenant API; published surfaces are listed in /agents.json, /.well-known/api-catalog, and /openapi.json. Start there to discover what the site exposes.`;
  }
  if (status === 405) return `The HTTP method is not allowed on "${pathname}". Check /openapi.json for the verbs each path accepts.`;
  if (status === 429) return `Rate limit exceeded on "${pathname}". Honour the Retry-After and RateLimit-* response headers and try again after the window resets.`;
  if (status >= 500) return `An upstream error occurred while serving "${pathname}". This is server-side; retry with exponential backoff.`;
  return `The request to "${pathname}" was rejected with HTTP ${status}.`;
}

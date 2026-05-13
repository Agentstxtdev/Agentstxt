import { Mppx, tempo, stripe } from 'mppx/server';
import Stripe from 'stripe';

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
}

const MCP_PREFIXES  = ['/mcp', '/sse'];
const AUTH_PREFIXES = ['/.well-known/agent-configuration', '/agent/', '/capability/', '/auth'];

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
// For agentstxt.dev there is no real gated resource (the spec and docs are
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
    const PAGE_PATHS = /^\/(spec|demo(\/[^/]+)?)?$/;
    const accept = request.headers.get('accept') ?? '';
    if (request.method === 'GET' && /text\/markdown/i.test(accept) && PAGE_PATHS.test(pathname)) {
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
          resource: 'https://agentstxt.dev/x402',
          standard: 'https://agentstxt.dev',
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
          url:         'https://agentstxt.dev/x402',
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
            resource: 'https://agentstxt.dev/mpp',
            standard: 'https://agentstxt.dev',
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
            url:         'https://agentstxt.dev/mpp',
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

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

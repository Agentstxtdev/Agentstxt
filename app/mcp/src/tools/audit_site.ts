import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseAgentsTxt, type ParsedAgentsTxt } from './parse_agents_txt.js';
import {
  PAYMENT_PROTOCOLS,
  AUTH_PROTOCOLS,
  MPP_METHODS,
  isAcceptedPaymentIdentifier,
  isAcceptedAuthIdentifier,
} from '../protocols.js';

// audit_site
// ---------------------------------------------------------------------------
// Audits a live site for compliance with the agents.txt specification.
// Scope:
//   - `agents.txt` (§3, §5–§8): structural validation of every directive
//   - `agents.json` (§11): JSON schema validation
//   - §4.5 serving requirements: Content-Type, CORS, Cache-Control on both
//   - cross-file consistency: anything declared in agents.txt must also
//     appear in agents.json (when both are served)
//   - robots.txt (light touch): confirm the spec §4.3 discovery surface
//     `Allow: /agents.txt` is present. The full RFC 9309 audit lives
//     elsewhere; we only verify the agents.txt-relevant signal.
//
// Out of scope (different specs governed by different bodies): the rest of
// robots.txt validation, sitemap.xml (sitemaps.org), llms.txt (llmstxt.org).

const SPEC_URL = 'https://agentstxt.dev';
const TREASURY_REGEX = /\b0x[a-fA-F0-9]{40}\b/;
// Solana base58 wallet: standard alphabet (no 0OIl), address length range.
// Applied to parsed JSON string values only, so CAIP-2 chain IDs like
// "solana:5eyk..." never match (the colon excludes the whole-string match).
const SOLANA_WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function findSolanaWalletInJson(value: unknown, path: string[] = []): { path: string; value: string } | null {
  if (typeof value === 'string') {
    return SOLANA_WALLET_REGEX.test(value) ? { path: path.join('.') || '<root>', value } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findSolanaWalletInJson(value[i], [...path, `[${i}]`]);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findSolanaWalletInJson(v, [...path, k]);
      if (hit) return hit;
    }
  }
  return null;
}

type ResponseHeaders = {
  contentType: string | null;
  corsAllOrigins: boolean;
  cacheControl: string | null;
};

type FetchOk = { found: true; content: string; status: number; headers: ResponseHeaders };
type FetchFail = { found: false; status: number; error?: string };
type FetchResult = FetchOk | FetchFail;

async function safeFetch(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'agents-txt-validator/1.0 (https://agentstxt.dev/mcp)' },
      signal: AbortSignal.timeout(8000),
    });
    const headers: ResponseHeaders = {
      contentType: res.headers.get('content-type'),
      corsAllOrigins: res.headers.get('access-control-allow-origin') === '*',
      cacheControl: res.headers.get('cache-control'),
    };
    if (!res.ok) return { found: false, status: res.status };
    return { found: true, content: await res.text(), status: res.status, headers };
  } catch (err) {
    return { found: false, status: 0, error: String(err) };
  }
}

function normalizeOrigin(input: string): string {
  const s = input.trim();
  const withProto = s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`;
  return new URL(withProto).origin;
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function checkServingHeaders(headers: ResponseHeaders, expectedContentType: RegExp, errors: string[], warnings: string[]) {
  // §4.5: Content-Type MUST match
  if (!headers.contentType || !expectedContentType.test(headers.contentType)) {
    errors.push(`§4.5: Content-Type "${headers.contentType ?? '(missing)'}" does not match required ${expectedContentType}`);
  }
  // §4.5: Access-Control-Allow-Origin MUST be *
  if (!headers.corsAllOrigins) {
    errors.push('§4.5: Access-Control-Allow-Origin must be "*"');
  }
  // §4.5: Cache-Control SHOULD be set
  if (!headers.cacheControl) {
    warnings.push('§4.5: Cache-Control header is recommended (e.g. "public, max-age=3600")');
  }
}

function auditAgentsTxt(content: string, headers: ResponseHeaders): {
  parsed: ParsedAgentsTxt;
  hasJsonComment: boolean;
  jsonCommentUrl: string | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  checkServingHeaders(headers, /^text\/plain\s*;\s*charset\s*=\s*utf-8\b/i, errors, warnings);

  const parsed = parseAgentsTxt(content);

  // §3.1 + §5: Payments block requires a non-empty Protocols: line. (Note:
  // parseAgentsTxt already drops the payments record when protocols is empty,
  // so reaching this branch with a parsed.payments means protocols is non-empty.)
  // §5: payment protocols must parse to recognized identifiers (warn-only per §12)
  if (parsed.payments?.protocols) {
    for (const p of parsed.payments.protocols) {
      if (!isAcceptedPaymentIdentifier(p)) {
        warnings.push(`§5: unrecognized payment protocol "${p}" (recognized: ${PAYMENT_PROTOCOLS.join(', ')}; use \`x-\` prefix for experimental)`);
      }
    }
  }
  // §6: authorization protocols
  if (parsed.authorization?.protocols) {
    if (parsed.authorization.protocols.length === 0) {
      errors.push('§6: "Authorization:" must list at least one protocol');
    }
    for (const p of parsed.authorization.protocols) {
      if (!isAcceptedAuthIdentifier(p)) {
        warnings.push(`§6: unrecognized authorization protocol "${p}" (recognized: ${AUTH_PROTOCOLS.join(', ')}; use \`x-\` prefix for experimental)`);
      }
    }
  }
  // §12: surface unknown directives as warnings, not errors (forward-compatible)
  for (const key of Object.keys(parsed.extensions)) {
    warnings.push(`§12: unknown directive "${key}:" (ignored). Use \`x-\` prefix for experimental identifiers; new block-level directives require a spec update.`);
  }
  // §7: MCP URLs must be valid HTTPS
  for (const u of parsed.mcp) {
    if (!isHttpsUrl(u)) errors.push(`§7: invalid MCP URL "${u}"`);
    else if (!u.startsWith('https://')) warnings.push(`§7: MCP URL should use HTTPS: "${u}"`);
  }
  // §8: Skills URLs must be valid
  for (const u of parsed.skills) {
    if (!isHttpsUrl(u)) errors.push(`§8: invalid Skills URL "${u}"`);
    else if (!u.startsWith('https://')) warnings.push(`§8: Skills URL should use HTTPS: "${u}"`);
  }
  // §9: A2A URLs must be valid HTTPS
  for (const u of parsed.a2a) {
    if (!isHttpsUrl(u)) errors.push(`§9: invalid A2A URL "${u}"`);
    else if (!u.startsWith('https://')) warnings.push(`§9: A2A URL should use HTTPS: "${u}"`);
  }

  // §4.2: # JSON: comment SHOULD be present (especially when capabilities declared)
  const jsonMatch = content.match(/^\s*#\s*JSON:\s*(\S+)/m);
  const hasJsonComment = !!jsonMatch;
  const jsonCommentUrl = jsonMatch?.[1] ?? null;
  if (!hasJsonComment) {
    warnings.push('§4.2: "# JSON:" comment recommended to point agents at the agents.json companion');
  } else if (jsonCommentUrl && !isHttpsUrl(jsonCommentUrl)) {
    errors.push(`§4.2: "# JSON:" comment value is not a valid URL: "${jsonCommentUrl}"`);
  }

  return { parsed, hasJsonComment, jsonCommentUrl, errors, warnings };
}

function auditAgentsJson(text: string, headers: ResponseHeaders, origin: string): {
  parsed: Record<string, unknown> | null;
  parseError: string | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  checkServingHeaders(headers, /^application\/json\b/i, errors, warnings);

  // §11.4 / §13: forbidden content (wallet addresses, anything that smells like a secret)
  const treasuryHit = text.match(TREASURY_REGEX);
  if (treasuryHit) {
    errors.push(`§11.4 / §13: agents.json contains what looks like an EVM wallet address "${treasuryHit[0]}"; treasury addresses must only appear in 402 responses`);
  }
  if (/\b(sk_live_|sk_test_|whsec_|rk_live_)[a-zA-Z0-9]{8,}/i.test(text)) {
    errors.push('§11.4 / §13: agents.json contains what looks like a Stripe-style secret key; secrets must never appear in discovery files');
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    return { parsed: null, parseError: String(err), errors: [...errors, '§11: agents.json is not valid JSON'], warnings };
  }

  // §11.4 / §13: Solana wallet leak. Walks parsed values so CAIP-2 chain IDs
  // (`solana:5eyk...`) are exempt by construction — the colon prevents a
  // whole-string match against the base58 regex.
  const solanaHit = findSolanaWalletInJson(parsed);
  if (solanaHit) {
    errors.push(`§11.4 / §13: agents.json contains what looks like a Solana wallet address "${solanaHit.value}" at ${solanaHit.path}; wallet addresses must only appear in 402 responses`);
  }

  // §11.2: required top-level fields
  if (typeof parsed.version !== 'string') {
    errors.push('§11.2: "version" (string) is required');
  } else if (!/^\d+\.\d+$/.test(parsed.version)) {
    warnings.push(`§11.3: "version" "${parsed.version}" should match numeric \`<major>.<minor>\` (no pre-release suffix)`);
  }
  if (typeof parsed.standard !== 'string') {
    errors.push('§11.2: "standard" (string) is required');
  } else if (parsed.standard !== SPEC_URL) {
    warnings.push(`§11.2: "standard" is "${parsed.standard}" (canonical value is "${SPEC_URL}")`);
  }
  const site = parsed.site as Record<string, unknown> | undefined;
  if (!site || typeof site !== 'object') {
    errors.push('§11.2: "site" object is required');
  } else {
    if (typeof site.name !== 'string' || !site.name.trim()) errors.push('§11.2: "site.name" must be a non-empty string');
    if (typeof site.url !== 'string' || !isHttpsUrl(site.url)) {
      errors.push('§11.2: "site.url" must be a valid URL');
    } else if (new URL(site.url).origin !== origin) {
      warnings.push(`§11.2: "site.url" origin "${new URL(site.url).origin}" does not match audited origin "${origin}"`);
    }
  }

  // §11.2 / §11.3: payments block shape
  const payments = parsed.payments as Record<string, unknown> | undefined;
  if (payments) {
    if ('required' in payments && typeof payments.required !== 'boolean') {
      errors.push('§11.2: "payments.required" must be a boolean when present');
    }
    const protocolKeys = Object.keys(payments).filter(
      (k) => (PAYMENT_PROTOCOLS as readonly string[]).includes(k) || k.startsWith('x-'),
    );
    if (protocolKeys.length === 0) {
      errors.push(`§11.2: "payments" must include at least one per-protocol object (${PAYMENT_PROTOCOLS.join(' or ')}, or an x- prefixed experimental key)`);
    }
    const mpp = payments.mpp as Record<string, unknown> | undefined;
    if (mpp && 'methods' in mpp) {
      const methods = mpp.methods;
      if (!Array.isArray(methods) || methods.length === 0) {
        errors.push('§11.3: "payments.mpp.methods" must be a non-empty array when present');
      } else {
        const recognised = new Set<string>(MPP_METHODS);
        for (const m of methods as unknown[]) {
          if (typeof m !== 'string' || !recognised.has(m)) {
            warnings.push(`§11.3: unrecognised MPP method "${String(m)}" (recognised: ${MPP_METHODS.join(', ')})`);
          }
        }
      }
    }
  }

  // §11.2: authorization block
  const authorization = parsed.authorization as Record<string, unknown> | undefined;
  if (authorization) {
    if (!Array.isArray(authorization.protocols) || authorization.protocols.length === 0) {
      errors.push('§11.2: "authorization.protocols" must be a non-empty array');
    }
    if (typeof authorization.discovery !== 'string') {
      warnings.push('§11.3: "authorization.discovery" should be set (e.g. "/.well-known/agent-configuration")');
    }
    if (authorization.identity !== undefined && authorization.identity !== 'required') {
      errors.push('§11.2: "authorization.identity" must be "required" if present');
    }
  }

  // §11.2: mcp[]
  const mcp = parsed.mcp as Array<Record<string, unknown>> | undefined;
  if (mcp !== undefined) {
    if (!Array.isArray(mcp)) {
      errors.push('§11.2: "mcp" must be an array');
    } else {
      mcp.forEach((entry, i) => {
        if (typeof entry?.url !== 'string' || !isHttpsUrl(entry.url)) {
          errors.push(`§11.2: "mcp[${i}].url" must be a valid URL`);
        }
        if (entry?.type !== 'streamable-http') {
          warnings.push(`§11.3: "mcp[${i}].type" is "${entry?.type ?? '(missing)'}" (always "streamable-http" for HTTP MCP endpoints)`);
        }
      });
    }
  }

  // §11.2: skills[]
  const skills = parsed.skills as Array<Record<string, unknown>> | undefined;
  if (skills !== undefined) {
    if (!Array.isArray(skills)) {
      errors.push('§11.2: "skills" must be an array');
    } else {
      skills.forEach((entry, i) => {
        if (typeof entry?.url !== 'string' || !isHttpsUrl(entry.url)) {
          errors.push(`§11.2: "skills[${i}].url" must be a valid URL`);
        }
      });
    }
  }

  // §11.2: a2a[]
  const a2a = parsed.a2a as Array<Record<string, unknown>> | undefined;
  if (a2a !== undefined) {
    if (!Array.isArray(a2a)) {
      errors.push('§11.2: "a2a" must be an array');
    } else {
      a2a.forEach((entry, i) => {
        if (typeof entry?.url !== 'string' || !isHttpsUrl(entry.url)) {
          errors.push(`§11.2: "a2a[${i}].url" must be a valid URL`);
        }
      });
    }
  }

  return { parsed, parseError: null, errors, warnings };
}

function crossCheck(
  txt: ParsedAgentsTxt,
  json: Record<string, unknown>,
  origin: string,
  jsonCommentUrl: string | null,
): string[] {
  const issues: string[] = [];
  const set = (a: string[] | undefined) => new Set((a ?? []).map((s) => s.trim()).filter(Boolean));
  const eqSet = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((v) => b.has(v));

  // payments block presence (presence = at least one protocol declared)
  const txtPaymentsPresent = !!txt.payments;
  const jsonPaymentsPresent = !!json.payments;
  if (txtPaymentsPresent !== jsonPaymentsPresent) {
    issues.push(`payments block presence mismatch: agents.txt ${txtPaymentsPresent ? 'present' : 'absent'}, agents.json ${jsonPaymentsPresent ? 'present' : 'absent'}`);
  }

  // payments.required (site-level policy)
  const txtPaymentsRequired = txt.payments?.required === true;
  const jsonPaymentsRequired = (json.payments as { required?: boolean } | undefined)?.required === true;
  if (txtPaymentsRequired !== jsonPaymentsRequired) {
    issues.push(`payments.required mismatch: agents.txt ${txtPaymentsRequired ? 'required' : 'unset'}, agents.json ${jsonPaymentsRequired ? 'required' : 'unset'}`);
  }

  // payments protocol set: agents.txt carries it as the `Protocols:` line;
  // agents.json carries it as the keys of the payments block intersected with
  // the recognised protocol identifiers.
  const txtPaymentProtos = set(txt.payments?.protocols);
  const jsonPayments = (json.payments as Record<string, unknown> | undefined) ?? {};
  const jsonPaymentProtos = new Set(
    Object.keys(jsonPayments).filter(
      (k) => (PAYMENT_PROTOCOLS as readonly string[]).includes(k) || k.startsWith('x-'),
    ),
  );
  if (!eqSet(txtPaymentProtos, jsonPaymentProtos)) {
    issues.push(`payments protocol set mismatch: agents.txt {${[...txtPaymentProtos].join(', ')}} vs agents.json {${[...jsonPaymentProtos].join(', ')}}`);
  }

  // authorization.protocols
  const txtAuthProtos = set(txt.authorization?.protocols);
  const jsonAuthProtos = set(((json.authorization as { protocols?: string[] } | undefined)?.protocols));
  if (!eqSet(txtAuthProtos, jsonAuthProtos)) {
    issues.push(`authorization.protocols mismatch: agents.txt {${[...txtAuthProtos].join(', ')}} vs agents.json {${[...jsonAuthProtos].join(', ')}}`);
  }

  // identity: required
  const txtIdentity = txt.authorization?.identity === 'required';
  const jsonIdentity = (json.authorization as { identity?: string } | undefined)?.identity === 'required';
  if (txtIdentity !== jsonIdentity) {
    issues.push(`authorization.identity mismatch: agents.txt ${txtIdentity ? 'required' : 'unset'}, agents.json ${jsonIdentity ? 'required' : 'unset'}`);
  }

  // mcp URLs
  const txtMcp = set(txt.mcp);
  const jsonMcp = set((json.mcp as Array<{ url?: string }> | undefined)?.map((e) => e?.url ?? ''));
  if (!eqSet(txtMcp, jsonMcp)) {
    issues.push(`MCP URL set mismatch: agents.txt {${[...txtMcp].join(', ')}} vs agents.json {${[...jsonMcp].join(', ')}}`);
  }

  // skills URLs
  const txtSkills = set(txt.skills);
  const jsonSkills = set((json.skills as Array<{ url?: string }> | undefined)?.map((e) => e?.url ?? ''));
  if (!eqSet(txtSkills, jsonSkills)) {
    issues.push(`Skills URL set mismatch: agents.txt {${[...txtSkills].join(', ')}} vs agents.json {${[...jsonSkills].join(', ')}}`);
  }

  // a2a URLs
  const txtA2a = set(txt.a2a);
  const jsonA2a = set((json.a2a as Array<{ url?: string }> | undefined)?.map((e) => e?.url ?? ''));
  if (!eqSet(txtA2a, jsonA2a)) {
    issues.push(`A2A URL set mismatch: agents.txt {${[...txtA2a].join(', ')}} vs agents.json {${[...jsonA2a].join(', ')}}`);
  }

  // # JSON: comment URL must reference the agents.json on the same origin
  if (jsonCommentUrl && isHttpsUrl(jsonCommentUrl)) {
    const commentOrigin = new URL(jsonCommentUrl).origin;
    if (commentOrigin !== origin) {
      issues.push(`"# JSON:" comment in agents.txt points at "${commentOrigin}", but the audited origin is "${origin}"`);
    }
  }

  return issues;
}

export function registerAuditSite(server: McpServer) {
  server.registerTool(
    'audit_site',
    {
      description:
        'Fetch and audit a live site for agents.txt spec compliance. Validates agents.txt and agents.json against the directives in §3-§9, the JSON schema in §11, and the §4.5 HTTP serving requirements; cross-checks the two files for consistency. Scope is the agents.txt spec only — robots.txt, sitemap.xml, and llms.txt are governed by other specs and are not audited here.',
      inputSchema: {
        url: z.string().describe('Site origin or URL to audit (e.g. "https://example.com" or "example.com")'),
      },
    },
    async ({ url }: { url: string }) => {
      let origin: string;
      try {
        origin = normalizeOrigin(url);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Invalid URL: "${url}"` }, null, 2) }],
          isError: true,
        };
      }

      const [txtResult, jsonResult, robotsResult] = await Promise.all([
        safeFetch(`${origin}/agents.txt`),
        safeFetch(`${origin}/agents.json`),
        safeFetch(`${origin}/robots.txt`),
      ]);

      const report: Record<string, unknown> = { site: origin };

      // ── agents.txt (§4.1: MUST be at <origin>/agents.txt) ─────────────────
      let parsedTxt: ParsedAgentsTxt | null = null;
      let jsonCommentUrl: string | null = null;
      if (txtResult.found) {
        const audit = auditAgentsTxt(txtResult.content, txtResult.headers);
        parsedTxt = audit.parsed;
        jsonCommentUrl = audit.jsonCommentUrl;
        report.agentsTxt = {
          found: true,
          status: txtResult.status,
          headers: txtResult.headers,
          parsed: audit.parsed,
          hasJsonComment: audit.hasJsonComment,
          validation: { valid: audit.errors.length === 0, errors: audit.errors, warnings: audit.warnings },
        };
      } else {
        report.agentsTxt = {
          found: false,
          status: txtResult.status,
          error: (txtResult as FetchFail).error,
          validation: { valid: false, errors: ['§4.1: agents.txt MUST be served at <origin>/agents.txt'], warnings: [] },
        };
      }

      // ── agents.json (§4.1: SHOULD be at <origin>/agents.json) ────────────
      let parsedJson: Record<string, unknown> | null = null;
      if (jsonResult.found) {
        const audit = auditAgentsJson(jsonResult.content, jsonResult.headers, origin);
        parsedJson = audit.parsed;
        report.agentsJson = {
          found: true,
          status: jsonResult.status,
          headers: jsonResult.headers,
          parsed: audit.parsed,
          parseError: audit.parseError,
          validation: { valid: audit.errors.length === 0, errors: audit.errors, warnings: audit.warnings },
        };
      } else {
        report.agentsJson = {
          found: false,
          status: jsonResult.status,
          validation: {
            valid: true,
            errors: [],
            warnings: ['§4.1: agents.json is SHOULD-served; recommended for richer agent decision-making'],
          },
        };
      }

      // ── robots.txt (§4.3 spec-aligned signal only) ────────────────────────
      // We do not audit RFC 9309 here. The only check is that robots.txt, if
      // served, exposes /agents.txt to crawlers via `Allow: /agents.txt` in
      // its default wildcard block — that is the canonical discovery surface
      // the agents.txt spec relies on. Anything else (block lists, sitemap
      // references, Content-Signal:, etc.) is out of scope for this tool.
      if (robotsResult.found) {
        const allowsAgentsTxt = /^\s*Allow:\s*\/agents\.txt\b/m.test(robotsResult.content);
        const warnings: string[] = [];
        if (!allowsAgentsTxt) {
          warnings.push('§4.3: robots.txt is served but does not include `Allow: /agents.txt` in its wildcard block; crawlers may treat /agents.txt as disallowed depending on the rest of the file');
        }
        report.robotsTxt = {
          found: true,
          status: robotsResult.status,
          allowsAgentsTxt,
          validation: { valid: true, errors: [], warnings },
        };
      } else {
        report.robotsTxt = {
          found: false,
          status: robotsResult.status,
          validation: { valid: true, errors: [], warnings: [] },
        };
      }

      // ── Cross-file consistency (only when both parsed cleanly) ───────────
      // Scoped to agents.txt ↔ agents.json. robots.txt is a different spec
      // and is intentionally not part of this consistency check.
      if (parsedTxt && parsedJson) {
        const issues = crossCheck(parsedTxt, parsedJson, origin, jsonCommentUrl);
        report.consistency = { valid: issues.length === 0, issues };
      } else {
        report.consistency = {
          valid: true,
          issues: [],
          note: 'Cross-file consistency check skipped (need both agents.txt and agents.json available and parseable).',
        };
      }

      // ── Roll-up ──────────────────────────────────────────────────────────
      const allErrors = [
        ...((report.agentsTxt as { validation?: { errors?: string[] } }).validation?.errors ?? []),
        ...((report.agentsJson as { validation?: { errors?: string[] } }).validation?.errors ?? []),
        ...((report.robotsTxt as { validation?: { errors?: string[] } }).validation?.errors ?? []),
        ...((report.consistency as { issues?: string[] }).issues ?? []),
      ];
      const allWarnings = [
        ...((report.agentsTxt as { validation?: { warnings?: string[] } }).validation?.warnings ?? []),
        ...((report.agentsJson as { validation?: { warnings?: string[] } }).validation?.warnings ?? []),
        ...((report.robotsTxt as { validation?: { warnings?: string[] } }).validation?.warnings ?? []),
      ];
      report.summary = {
        compliant: allErrors.length === 0,
        errorCount: allErrors.length,
        warningCount: allWarnings.length,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
    },
  );
}

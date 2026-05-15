import { describe, it, expect, afterEach, vi } from 'vitest';
import { runAudit } from './audit_site.js';
import { installFetch, res } from '../__tests__/helpers.js';

const TXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' };
const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' };

function compliantTxt() {
  return [
    '# JSON: https://example.com/agents.json',
    'Protocols: x402',
    'MCP: https://example.com/mcp',
    'Skills: https://example.com/skills/foo/SKILL.md',
    'A2A: https://example.com/a2a',
    'UCP: https://example.com/ucp',
    'Authorization: agent-auth',
  ].join('\n');
}

function compliantJson() {
  return JSON.stringify({
    version: '0.5',
    standard: 'https://agents-txt.com',
    site: { name: 'Example', url: 'https://example.com' },
    payments: { x402: {} },
    authorization: { protocols: ['agent-auth'], discovery: '/.well-known/agent-configuration' },
    mcp: [{ url: 'https://example.com/mcp', type: 'streamable-http' }],
    skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }],
    a2a: [{ url: 'https://example.com/a2a' }],
    ucp: [{ url: 'https://example.com/ucp' }],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAudit — input handling', () => {
  it('returns an _error report for malformed URLs', async () => {
    const out = await runAudit('not a url');
    expect(out._error).toBe(true);
    expect(out.error).toMatch(/Invalid URL/);
  });

  it('accepts bare hostnames by adding https://', async () => {
    installFetch(() => res('', { status: 404 }));
    const out = await runAudit('example.com');
    expect(out.site).toBe('https://example.com');
  });

  it('preserves the origin (drops path / search / hash)', async () => {
    installFetch(() => res('', { status: 404 }));
    const out = await runAudit('https://example.com/some/path?q=1');
    expect(out.site).toBe('https://example.com');
  });
});

describe('runAudit — agents.txt missing', () => {
  it('reports §4.1 error when agents.txt is not found', async () => {
    installFetch(() => res('', { status: 404 }));
    const out: any = await runAudit('https://example.com');
    expect(out.agentsTxt.found).toBe(false);
    expect(out.agentsTxt.validation.errors).toContain(
      '§4.1: agents.txt MUST be served at <origin>/agents.txt',
    );
    expect(out.summary.compliant).toBe(false);
  });

  it('agents.json missing is a warning, not an error', async () => {
    installFetch(() => res('', { status: 404 }));
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.found).toBe(false);
    expect(out.agentsJson.validation.errors).toEqual([]);
    expect(out.agentsJson.validation.warnings.some((w: string) => /SHOULD-served/.test(w))).toBe(true);
  });
});

describe('runAudit — compliant site', () => {
  it('produces a compliant=true summary when both files are spec-clean', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(compliantJson(), { headers: JSON_HEADERS });
      if (url.endsWith('/robots.txt')) return res('User-agent: *\nAllow: /agents.txt\n', { headers: { 'content-type': 'text/plain' } });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.summary.compliant).toBe(true);
    expect(out.summary.errorCount).toBe(0);
    expect(out.agentsTxt.validation.errors).toEqual([]);
    expect(out.agentsJson.validation.errors).toEqual([]);
    expect(out.consistency.valid).toBe(true);
    expect(out.robotsTxt.allowsAgentsTxt).toBe(true);
  });
});

describe('runAudit — §4.5 serving header violations', () => {
  it('flags wrong Content-Type, missing CORS, missing Cache-Control', async () => {
    installFetch((url) => {
      // Force a Content-Type that doesn't match the §4.5 regex; otherwise
      // `new Response(string)` would default to a passing `text/plain;charset=UTF-8`.
      if (url.endsWith('/agents.txt')) {
        return res('MCP: https://example.com/mcp\n', { headers: { 'content-type': 'application/octet-stream' } });
      }
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    const errs = out.agentsTxt.validation.errors;
    expect(errs.some((e: string) => /Content-Type/.test(e))).toBe(true);
    expect(errs).toContain('§4.5: Access-Control-Allow-Origin must be "*"');
    const warns = out.agentsTxt.validation.warnings;
    expect(warns.some((w: string) => /Cache-Control/.test(w))).toBe(true);
  });

  it('flags wrong Content-Type on agents.json', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(compliantJson(), { headers: { ...JSON_HEADERS, 'content-type': 'text/plain' } });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors.some((e: string) => /Content-Type/.test(e))).toBe(true);
  });
});

describe('runAudit — secret leak detection (§5.4 / §14)', () => {
  it('flags an EVM wallet address embedded in agents.json', async () => {
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { x402: { recipient: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01' } },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors.some((e: string) => /EVM wallet/.test(e))).toBe(true);
  });

  it('flags a Solana wallet address embedded in agents.json', async () => {
    const solanaAddress = '5eyXkSp4iJqzg8ckwiZmZWeWLwGbtmcPHo3DTbMpump';
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { x402: { recipient: solanaAddress } },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors.some((e: string) => /Solana wallet/.test(e))).toBe(true);
  });

  it('does NOT flag CAIP-2 chain IDs (the colon prefix excludes them)', async () => {
    const solanaAddress = '5eyXkSp4iJqzg8ckwiZmZWeWLwGbtmcPHo3DTbMpump';
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { x402: { chain: `solana:${solanaAddress}` } },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors.some((e: string) => /Solana wallet/.test(e))).toBe(false);
  });

  it('flags Stripe-style secret keys', async () => {
    const leaky = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { x402: { key: 'sk_live_abcdefgh1234' } },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.json')) return res(leaky, { headers: JSON_HEADERS });
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors.some((e: string) => /Stripe-style secret/.test(e))).toBe(true);
  });
});

describe('runAudit — agents.json schema violations', () => {
  it('flags invalid JSON', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res('{ broken', { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.errors).toContain('§5: agents.json is not valid JSON');
  });

  it('flags missing required top-level fields', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res('{}', { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    const errs = out.agentsJson.validation.errors;
    expect(errs.some((e: string) => /"version".*required/.test(e))).toBe(true);
    expect(errs.some((e: string) => /"standard".*required/.test(e))).toBe(true);
    expect(errs.some((e: string) => /"site" object is required/.test(e))).toBe(true);
  });

  it('warns when site.url origin differs from audited origin', async () => {
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://different.com' },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsJson.validation.warnings.some((w: string) => /site\.url" origin.*does not match/.test(w))).toBe(true);
  });
});

describe('runAudit — cross-file consistency', () => {
  it('flags payments protocol-set mismatch between agents.txt and agents.json', async () => {
    const txt = compliantTxt(); // declares x402
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { mpp: {} }, // declares mpp instead
      mcp: [{ url: 'https://example.com/mcp', type: 'streamable-http' }],
      skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }],
      a2a: [{ url: 'https://example.com/a2a' }],
      ucp: [{ url: 'https://example.com/ucp' }],
      authorization: { protocols: ['agent-auth'] },
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(txt, { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.consistency.valid).toBe(false);
    expect(out.consistency.issues.some((i: string) => /payments protocol set mismatch/.test(i))).toBe(true);
  });

  it('flags MCP URL set mismatch', async () => {
    const txt = 'Protocols: x402\nMCP: https://example.com/mcp\nAuthorization: agent-auth\n';
    const json = JSON.stringify({
      version: '0.5',
      standard: 'https://agents-txt.com',
      site: { name: 'X', url: 'https://example.com' },
      payments: { x402: {} },
      authorization: { protocols: ['agent-auth'] },
      mcp: [{ url: 'https://example.com/other-mcp', type: 'streamable-http' }],
    });
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(txt, { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(json, { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.consistency.issues.some((i: string) => /MCP URL set mismatch/.test(i))).toBe(true);
  });

  it('flags "# JSON:" comment pointing to a different origin', async () => {
    const txt = '# JSON: https://other.com/agents.json\nMCP: https://example.com/mcp\n';
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(txt, { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(compliantJson(), { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.consistency.issues.some((i: string) => /"# JSON:" comment.*points at/.test(i))).toBe(true);
  });

  it('skips cross-file check when agents.json is missing', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.consistency.valid).toBe(true);
    expect(out.consistency.note).toMatch(/skipped/);
  });
});

describe('runAudit — robots.txt', () => {
  it('warns when robots.txt is served but does not Allow /agents.txt', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(compliantJson(), { headers: JSON_HEADERS });
      if (url.endsWith('/robots.txt')) return res('User-agent: *\nDisallow: /\n');
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.robotsTxt.allowsAgentsTxt).toBe(false);
    expect(out.robotsTxt.validation.warnings.some((w: string) => /does not include `Allow: \/agents.txt`/.test(w))).toBe(true);
  });

  it('produces no robots.txt warnings when the file is absent', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(compliantTxt(), { headers: TXT_HEADERS });
      if (url.endsWith('/agents.json')) return res(compliantJson(), { headers: JSON_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.robotsTxt.found).toBe(false);
    expect(out.robotsTxt.validation.warnings).toEqual([]);
  });
});

describe('runAudit — network resilience', () => {
  it('reports fetch failure as not-found with the error string', async () => {
    installFetch(() => { throw new Error('boom'); });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsTxt.found).toBe(false);
    expect(out.agentsTxt.error).toMatch(/boom/);
  });

  it('uses the SITE service binding when target origin matches SITE_ORIGIN', async () => {
    const bindingFetch = vi.fn(async () => res(compliantTxt(), { headers: TXT_HEADERS }));
    // public fetch must NOT be called for the matching origin.
    const publicSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => res('', { status: 404 }));
    await runAudit('https://example.com', {
      SITE_ORIGIN: 'https://example.com',
      SITE: { fetch: bindingFetch as any },
    });
    // bindingFetch is invoked for each of the three resources at this origin
    expect(bindingFetch).toHaveBeenCalled();
    publicSpy.mockRestore();
  });
});

describe('runAudit — forward compatibility', () => {
  it('treats unknown directives as warnings, not errors', async () => {
    const txt = 'NewBlockType: https://example.com/foo\nMCP: https://example.com/mcp\n';
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(txt, { headers: TXT_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsTxt.validation.warnings.some((w: string) => /unknown directive "NewBlockType:"/.test(w))).toBe(true);
    expect(out.agentsTxt.validation.errors.some((e: string) => /NewBlockType/.test(e))).toBe(false);
  });

  it('accepts x- prefixed payment identifiers without warning', async () => {
    const txt = 'Protocols: x-mypay\nMCP: https://example.com/mcp\n';
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) return res(txt, { headers: TXT_HEADERS });
      return res('', { status: 404 });
    });
    const out: any = await runAudit('https://example.com');
    expect(out.agentsTxt.validation.warnings.some((w: string) => /x-mypay/.test(w))).toBe(false);
  });
});

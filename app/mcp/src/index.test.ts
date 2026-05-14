import { describe, it, expect, afterEach, vi } from 'vitest';
import { installFetch, res } from './__tests__/helpers.js';

// The default export from ./index.js pulls in ./server.js which imports
// `agents/mcp`, and that package uses the `cloudflare:` ESM protocol that
// Node's default loader rejects outside of a workers runtime. We stub the
// server module so the worker entrypoint is importable under plain Node.
vi.mock('./server.js', () => ({
  default: { fetch: async () => new Response('mcp-not-stubbed', { status: 501 }) },
  AgentsTxtMCP: class {},
}));

const env: any = { SITE_ORIGIN: 'https://example.com' };
const ctx: any = {};

afterEach(() => vi.restoreAllMocks());

function request(path: string, init?: RequestInit) {
  return new Request(`https://mcp.example${path}`, init);
}

async function loadWorker() {
  return (await import('./index.js')).default;
}

describe('worker root + /health', () => {
  it('returns service metadata at /', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/'), env, ctx);
    const body = await r.json() as any;
    expect(body.ok).toBe(true);
    expect(body.service).toBe('agents-txt-mcp');
    expect(body.endpoints.audit).toBe('/api/audit?url=<target>');
  });

  it('also responds to /health with the same payload', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/health'), env, ctx);
    const body = await r.json() as any;
    expect(body.ok).toBe(true);
  });
});

describe('worker /api/audit', () => {
  it('returns 400 when the url query param is missing', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/api/audit'), env, ctx);
    expect(r.status).toBe(400);
    const body = await r.json() as any;
    expect(body.error).toBe('missing_url');
  });

  it('handles a CORS preflight (OPTIONS) with 204 + CORS headers', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/api/audit', { method: 'OPTIONS' }), env, ctx);
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('returns 200 with audit report shape for a valid target', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.txt')) {
        return res('MCP: https://example.com/mcp\n', {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=3600',
          },
        });
      }
      return res('', { status: 404 });
    });
    const worker = await loadWorker();
    const r = await worker.fetch(request('/api/audit?url=https://target.example'), env, ctx);
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.site).toBe('https://target.example');
    expect(body.summary).toBeDefined();
    expect(body._error).toBeUndefined();
  });

  it('returns 400 for an invalid URL input and strips the _error flag', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/api/audit?url=not%20a%20url'), env, ctx);
    expect(r.status).toBe(400);
    const body = await r.json() as any;
    expect(body.error).toMatch(/Invalid URL/);
    expect(body._error).toBeUndefined();
  });

  it('adds CORS headers to every /api/audit response', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/api/audit'), env, ctx);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('delegates non-root, non-audit paths to the MCP handler', async () => {
    const worker = await loadWorker();
    const r = await worker.fetch(request('/mcp'), env, ctx);
    // Our stub returns 501; this proves we hit the delegated path.
    expect(r.status).toBe(501);
  });
});

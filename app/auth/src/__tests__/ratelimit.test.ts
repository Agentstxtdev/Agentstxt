import { describe, it, expect, vi } from 'vitest';
import { enforceRateLimit } from '../ratelimit.js';

type LimitOpts = { key: string };

function makeContext(opts: {
  binding?: { limit: (o: LimitOpts) => Promise<{ success: boolean }> };
  ip?: string | null;
}) {
  const calls: { jsonArgs: unknown[][] } = { jsonArgs: [] };
  const c: any = {
    env: { AUTH_KV: {}, ...(opts.binding ? { RL_AUTH: opts.binding } : {}) },
    req: {
      header: vi.fn((name: string) => {
        if (name.toLowerCase() === 'cf-connecting-ip') return opts.ip ?? undefined;
        return undefined;
      }),
    },
    json: vi.fn((body: unknown, status?: number, headers?: Record<string, string>) => {
      calls.jsonArgs.push([body, status, headers]);
      return new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { 'content-type': 'application/json', ...(headers ?? {}) },
      });
    }),
  };
  return { c, calls };
}

describe('enforceRateLimit — binding absent', () => {
  it('returns null when the RL_AUTH binding is undefined (test/dev no-op)', async () => {
    const { c } = makeContext({});
    expect(await enforceRateLimit(c, 'any_route')).toBeNull();
  });
});

describe('enforceRateLimit — binding present', () => {
  it('returns null when the limiter reports success', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const { c } = makeContext({ binding: { limit }, ip: '203.0.113.7' });
    const result = await enforceRateLimit(c, 'oauth_token');
    expect(result).toBeNull();
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7:oauth_token' });
  });

  it('returns a 429 Response when the limiter denies the request', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const { c } = makeContext({ binding: { limit }, ip: '203.0.113.7' });
    const result = await enforceRateLimit(c, 'oauth_token');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get('retry-after')).toBe('60');
    const body = await result!.json() as Record<string, unknown>;
    expect(body.error).toBe('rate_limited');
    expect(body.error_description).toMatch(/Slow down/);
  });

  it('falls back to "unknown" when cf-connecting-ip is absent (covers wrangler dev)', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const { c } = makeContext({ binding: { limit } });
    await enforceRateLimit(c, 'agent_register');
    expect(limit).toHaveBeenCalledWith({ key: 'unknown:agent_register' });
  });

  it('scopes the limiter key by route so different routes share IP but not bucket', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const { c } = makeContext({ binding: { limit }, ip: '198.51.100.42' });
    await enforceRateLimit(c, 'oauth_token');
    await enforceRateLimit(c, 'agent_register');
    expect(limit).toHaveBeenNthCalledWith(1, { key: '198.51.100.42:oauth_token' });
    expect(limit).toHaveBeenNthCalledWith(2, { key: '198.51.100.42:agent_register' });
  });
});

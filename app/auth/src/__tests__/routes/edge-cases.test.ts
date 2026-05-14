// Targeted edge-case tests across the route surface. Each describe block
// covers a branch that the primary route-test files don't reach: malformed
// inputs, missing-required-field paths, and discovery alias parity.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '../../index.js';
import { createMockKV, generateKeypair, makeHostJwt, registerAgent } from '../helpers.js';
import { hashClientSecret, toPublicJwk } from '../../oauth-jwt.js';

// ── /capability/describe edge cases ─────────────────────────────────────────

describe('GET /capability/describe — query handling', () => {
  it('returns 404 when the name query param is missing entirely', async () => {
    const res = await app.request('/capability/describe', {}, { AUTH_KV: createMockKV() });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the name is an empty string', async () => {
    const res = await app.request('/capability/describe?name=', {}, { AUTH_KV: createMockKV() });
    expect(res.status).toBe(404);
  });
});

// ── /agent/revoke malformed bodies ──────────────────────────────────────────

describe('POST /agent/revoke — body handling', () => {
  let kv: ReturnType<typeof createMockKV>;
  beforeEach(() => { kv = createMockKV(); });

  it('returns 404 when revoking an agent that was never registered', async () => {
    const { host } = await registerAgent(kv, app);
    const token = await makeHostJwt(host.publicJwk, host.privateKey);
    const res = await app.request('/agent/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'agt_nonexistent' }),
    }, { AUTH_KV: kv });
    expect(res.status).toBe(404);
  });
});

// ── /agent/register malformed authorization header ──────────────────────────

describe('POST /agent/register — Authorization header shape', () => {
  it('returns 401 when the Authorization header is not Bearer-scheme', async () => {
    const kv = createMockKV();
    const res = await app.request('/agent/register', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/Missing Bearer token/);
  });

  it('returns 401 invalid_jwt for a JWT with only two parts', async () => {
    const kv = createMockKV();
    const res = await app.request('/agent/register', {
      method: 'POST',
      headers: { Authorization: 'Bearer abc.def' },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_jwt');
  });
});

// ── /agent/register first-time flow without inline host_public_key ──────────

describe('POST /agent/register — first-time host registration', () => {
  it('returns 401 when iss references an unknown host and host_public_key is absent', async () => {
    const kv = createMockKV();
    const host = await generateKeypair();
    const agent = await generateKeypair();
    // Construct a host JWT but omit host_public_key — unknown host with no inline key.
    const token = await makeHostJwt(host.publicJwk, host.privateKey, agent.publicJwk, {});
    // Strip the host_public_key claim manually.
    const [h, p, s] = token.split('.');
    const padded = (str: string) => str + '==='.slice((str.length + 3) % 4);
    const payload = JSON.parse(atob(padded(p!).replace(/-/g, '+').replace(/_/g, '/')));
    delete payload.host_public_key;
    // But the iss thumbprint will still resolve only if KV has the host. With a fresh KV it does not.
    const newPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const rebuilt = `${h}.${newPayload}.${s}`;
    const res = await app.request('/agent/register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${rebuilt}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    // Either signature fails (because we tampered with the payload) or "Unknown host" — both prove the
    // route rejects rather than auto-creating. Accept either.
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_jwt');
  });
});

// ── /oauth/token Basic-auth parsing edge cases ──────────────────────────────

let privateJwkJson: string;
beforeAll(async () => {
  const keypair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey('jwk', keypair.privateKey) as Parameters<typeof toPublicJwk>[0] & { d: string };
  priv.kid = 'edge-kid';
  privateJwkJson = JSON.stringify(priv);
});

describe('POST /oauth/token — Basic auth header parsing', () => {
  it('falls back to form auth when Basic header is malformed (not base64)', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    env.AUTH_KV._set('oauth:client:demo', { hashed_secret: await hashClientSecret('s'), scopes: ['spec:read'], created_at: 0 });
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic !!!not-base64!!!',
      },
      body: 'grant_type=client_credentials&client_id=demo&client_secret=s',
    }, env);
    // Malformed Basic falls back to form auth which succeeds.
    expect(res.status).toBe(200);
  });

  it('returns 401 when Basic decodes but contains no colon', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('no-colon-here')}`,
      },
      body: 'grant_type=client_credentials',
    }, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 when neither Basic nor form-body credentials are present', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    }, env);
    expect(res.status).toBe(401);
    // No Basic was attempted, so WWW-Authenticate should be absent.
    expect(res.headers.get('www-authenticate')).toBeNull();
  });
});

// ── /oauth/token scope behaviour ────────────────────────────────────────────

describe('POST /oauth/token — scope behaviour', () => {
  it('omits the scope field when the client has no granted scopes', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    env.AUTH_KV._set('oauth:client:none', {
      hashed_secret: await hashClientSecret('s'),
      scopes: [],
      created_at: 0,
    });
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=none&client_secret=s',
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('scope');
  });

  it('grants ALL client scopes when no scope is requested (default behaviour)', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    env.AUTH_KV._set('oauth:client:multi', {
      hashed_secret: await hashClientSecret('s'),
      scopes: ['spec:read', 'mcp:tools'],
      created_at: 0,
    });
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=multi&client_secret=s',
    }, env);
    const body = await res.json() as { scope: string };
    const scopes = body.scope.split(' ').sort();
    expect(scopes).toEqual(['mcp:tools', 'spec:read']);
  });

  it('drops requested scopes that are not in the supported list', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    env.AUTH_KV._set('oauth:client:demo', {
      hashed_secret: await hashClientSecret('s'),
      scopes: ['spec:read'],
      created_at: 0,
    });
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=demo&client_secret=s&scope=spec:read pwn:everything',
    }, env);
    const body = await res.json() as { scope: string };
    expect(body.scope).toBe('spec:read');
  });
});

// ── /oauth/introspect edge cases ────────────────────────────────────────────

describe('POST /oauth/introspect — edge cases', () => {
  it('returns active=false when token field is missing', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    env.AUTH_KV._set('oauth:client:demo', { hashed_secret: await hashClientSecret('s'), scopes: ['spec:read'], created_at: 0 });
    const res = await app.request('/oauth/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=demo&client_secret=s',
    }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
  });

  it('returns 500 when OAUTH_PRIVATE_JWK is unset', async () => {
    const env: any = { AUTH_KV: createMockKV() }; // no OAUTH_PRIVATE_JWK
    const res = await app.request('/oauth/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=demo&client_secret=s&token=x.y.z',
    }, env);
    expect(res.status).toBe(500);
  });
});

// ── Discovery alias parity ──────────────────────────────────────────────────

describe('Discovery alias parity', () => {
  it('/.well-known/oauth-protected-resource exposes the resource origin', async () => {
    const env: any = { AUTH_KV: createMockKV(), OAUTH_PRIVATE_JWK: privateJwkJson };
    const res = await app.request('/.well-known/oauth-protected-resource', {}, env);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.resource).toBe('string');
    expect(body.bearer_methods_supported).toEqual(['header']);
    expect(body.resource_documentation).toMatch(/spec#11$/);
  });
});

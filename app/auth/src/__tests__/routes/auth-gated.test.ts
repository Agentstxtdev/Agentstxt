// Tests for GET /auth — the resource gated by the agent-auth protocol.
// Currently not exercised anywhere else in the suite; this file fills that gap.

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../index.js';
import { createMockKV, generateKeypair, makeHostJwt, makeAgentJwt, registerAgent, signJwt, thumbprint } from '../helpers.js';

const HOST = 'http://localhost';

describe('GET /auth', () => {
  let kv: ReturnType<typeof createMockKV>;
  beforeEach(() => { kv = createMockKV(); });

  it('returns 401 with a discovery hint when Authorization is missing', async () => {
    const res = await app.request('/auth', {}, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('unauthenticated');
    expect(body.discovery).toMatch(/\.well-known\/agent-configuration/);
  });

  it('returns 401 invalid_jwt for a malformed Bearer token', async () => {
    const res = await app.request('/auth', {
      headers: { Authorization: 'Bearer not.a.jwt' },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('invalid_jwt');
  });

  it('returns 401 when typ is host+jwt (must be agent+jwt for /auth)', async () => {
    const { host, agent } = await registerAgent(kv, app);
    const wrong = await makeHostJwt(host.publicJwk, host.privateKey, agent.publicJwk);
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${wrong}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toContain('agent+jwt');
  });

  it('returns 401 when audience does not match /auth URL', async () => {
    const { agentId, host, agent } = await registerAgent(kv, app);
    // makeAgentJwt sets aud=…/capability/execute by default. /auth requires aud=…/auth.
    const token = await makeAgentJwt(host.publicJwk, agent.privateKey, agentId);
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    expect((await res.json() as { message: string }).message).toBe('audience mismatch');
  });

  it('returns 200 with authenticated=true for a valid agent+jwt with the correct audience', async () => {
    const { agentId, host, agent } = await registerAgent(kv, app);
    const token = await makeAgentJwt(host.publicJwk, agent.privateKey, agentId, {
      aud: `${HOST}/auth`,
    });
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.authenticated).toBe(true);
    expect(body.agent_id).toBe(agentId);
  });

  it('returns 403 agent_revoked when the agent has been revoked', async () => {
    const { agentId, host, agent } = await registerAgent(kv, app);
    await app.request('/agent/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await makeHostJwt(host.publicJwk, host.privateKey)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    }, { AUTH_KV: kv });
    const token = await makeAgentJwt(host.publicJwk, agent.privateKey, agentId, { aud: `${HOST}/auth` });
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(403);
    expect((await res.json() as { error: string }).error).toBe('agent_revoked');
  });

  it('returns 401 when the signature is forged against the wrong key', async () => {
    const { agentId, host } = await registerAgent(kv, app);
    const attacker = await generateKeypair();
    const token = await makeAgentJwt(host.publicJwk, attacker.privateKey, agentId, { aud: `${HOST}/auth` });
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    expect((await res.json() as { message: string }).message).toBe('Signature verification failed');
  });

  it('returns 401 when the JWT is missing iss/sub', async () => {
    const { host, agent } = await registerAgent(kv, app);
    const token = await signJwt(
      { aud: `${HOST}/auth` /* no iss, no sub */ },
      { typ: 'agent+jwt' },
      agent.privateKey,
    );
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    expect((await res.json() as { message: string }).message).toMatch(/Missing iss or sub/);
  });

  it('returns 401 when the host (iss) is unknown', async () => {
    const ghostHost = await generateKeypair();
    const agent = await generateKeypair();
    const token = await signJwt(
      { iss: await thumbprint(ghostHost.publicJwk), sub: 'agt_phantom', aud: `${HOST}/auth` },
      { typ: 'agent+jwt' },
      agent.privateKey,
    );
    const res = await app.request('/auth', {
      headers: { Authorization: `Bearer ${token}` },
    }, { AUTH_KV: kv });
    expect(res.status).toBe(401);
    expect((await res.json() as { message: string }).message).toBe('Unknown host');
  });

  it('returns 401 when jti is reused (replay protection)', async () => {
    const { agentId, host, agent } = await registerAgent(kv, app);
    const token = await makeAgentJwt(host.publicJwk, agent.privateKey, agentId, { aud: `${HOST}/auth` });
    const first  = await app.request('/auth', { headers: { Authorization: `Bearer ${token}` } }, { AUTH_KV: kv });
    expect(first.status).toBe(200);
    const second = await app.request('/auth', { headers: { Authorization: `Bearer ${token}` } }, { AUTH_KV: kv });
    expect(second.status).toBe(401);
    expect((await second.json() as { message: string }).message).toMatch(/replay/);
  });
});

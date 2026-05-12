import { Hono } from 'hono';
import type { Env, AgentRecord } from '../types.js';
import { parseJwt, verifyEd25519, assertClaims } from '../jwt.js';

function err(c: any, status: number, code: string, message: string) {
  return c.json({ error: code, message }, status);
}

async function verifyAgentJwt(authHeader: string | undefined, kv: KVNamespace, expectedAudience: string): Promise<
  | { ok: true; agentId: string; hostThumbprint: string }
  | { ok: false; status: number; code: string; message: string }
> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'invalid_request', message: 'Missing Bearer token' };
  }

  const token = authHeader.slice(7);
  const parsed = parseJwt(token);
  if (!parsed) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Malformed JWT' };
  if (parsed.header['typ'] !== 'agent+jwt') return { ok: false, status: 401, code: 'invalid_jwt', message: 'Expected agent+jwt' };

  const claimErr = assertClaims(parsed.payload, expectedAudience);
  if (claimErr) return { ok: false, status: 401, code: 'invalid_jwt', message: claimErr };

  const jti = parsed.payload.jti;
  if (!jti) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Missing jti' };
  const jtiKey = `jti:${jti}`;
  if (await kv.get(jtiKey)) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Token replay detected' };

  const hostThumbprint = parsed.payload.iss as string | undefined;
  const agentId = parsed.payload.sub as string | undefined;
  if (!hostThumbprint || !agentId) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Missing iss or sub' };

  // Verify host exists (iss must be a known host thumbprint)
  const hostRecord = await kv.get(`host:${hostThumbprint}`, 'json');
  if (!hostRecord) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Unknown host' };

  // Look up agent and verify signature against the agent's own public key
  const agentRecord = await kv.get<AgentRecord>(`agent:${agentId}`, 'json');
  if (!agentRecord) return { ok: false, status: 404, code: 'not_found', message: 'Agent not found' };
  if (agentRecord.status === 'revoked') return { ok: false, status: 403, code: 'agent_revoked', message: 'Agent has been revoked' };

  const valid = await verifyEd25519(parsed.signedData, parsed.signature, agentRecord.agentPublicKeyJwk);
  if (!valid) return { ok: false, status: 401, code: 'invalid_jwt', message: 'Signature verification failed' };

  await kv.put(jtiKey, '1', { expirationTtl: 90 });

  return { ok: true, agentId, hostThumbprint };
}

export function mountProtectedRoutes(app: Hono<{ Bindings: Env }>) {
  // GET /auth — the gated resource. Without a valid agent JWT → 401 + discovery hint.
  // With a valid agent JWT → authenticated success. This is the working PoC of auth gating.
  app.get('/auth', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        error: 'unauthenticated',
        message: 'This resource requires a valid agent JWT. Discover the auth provider and register first.',
        discovery: new URL('/.well-known/agent-configuration', c.req.url).toString(),
      }, 401);
    }

    const result = await verifyAgentJwt(authHeader, c.env.AUTH_KV, new URL(c.req.url).toString().split('?')[0]!);
    if (!result.ok) return err(c, result.status, result.code, result.message);

    return c.json({
      authenticated: true,
      agent_id: result.agentId,
      host_id: result.hostThumbprint,
      message: 'You have successfully accessed a resource protected by the agent-auth protocol.',
    });
  });
}

export function mountCapabilityRoutes(app: Hono<{ Bindings: Env }>) {
  app.get('/capability/list', (c) => {
    return c.json({
      capabilities: [
        {
          name: 'ping',
          description: 'Proof-of-authentication capability. Returns authenticated agent identity.',
          arguments: {},
        },
      ],
    });
  });

  app.get('/capability/describe', (c) => {
    const name = c.req.query('name');
    if (name !== 'ping') return c.json({ error: 'not_found', message: `Unknown capability: "${name}"` }, 404);
    return c.json({
      name: 'ping',
      description: 'Proof-of-authentication capability. Returns authenticated agent identity. No data is gated.',
      arguments: {},
      result: {
        authenticated: { type: 'boolean' },
        agent_id: { type: 'string' },
        message: { type: 'string' },
      },
    });
  });

  app.post('/capability/execute', async (c) => {
    const result = await verifyAgentJwt(c.req.header('Authorization'), c.env.AUTH_KV, new URL(c.req.url).toString().split('?')[0]!);
    if (!result.ok) return err(c, result.status, result.code, result.message);

    const body = await c.req.json().catch(() => ({})) as { capability?: string };
    if (body.capability && body.capability !== 'ping') {
      return c.json({ error: 'capability_not_granted', message: `Capability "${body.capability}" is not granted` }, 403);
    }

    return c.json({
      data: {
        authenticated: true,
        agent_id: result.agentId,
        host_id: result.hostThumbprint,
        message: 'Agent successfully authenticated via agent-auth protocol. This PoC gates nothing — authentication proof only.',
      },
    });
  });
}

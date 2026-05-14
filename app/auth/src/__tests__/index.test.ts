// Worker-level entrypoint coverage: /health, 404 fallback, and CORS middleware.

import { describe, it, expect } from 'vitest';
import app from '../index.js';
import { createMockKV } from './helpers.js';

const env = { AUTH_KV: createMockKV() };

describe('GET /health', () => {
  it('returns 200 with the service identity payload', async () => {
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.service).toBe('agents-txt-auth');
    expect(body).toHaveProperty('version');
  });
});

describe('404 fallback', () => {
  it('returns a structured error for unknown paths', async () => {
    const res = await app.request('/this/path/does/not/exist', {}, env);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('not_found');
    expect(body.message).toMatch(/No route for GET/);
  });

  it('includes the HTTP method in the error message', async () => {
    const res = await app.request('/this/path/does/not/exist', { method: 'POST' }, env);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toMatch(/POST/);
  });
});

describe('CORS middleware', () => {
  it('attaches Access-Control-Allow-Origin: * to GET responses', async () => {
    const res = await app.request('/health', { headers: { Origin: 'https://example.com' } }, env);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles a preflight OPTIONS request with the allowed methods + headers', async () => {
    const res = await app.request('/agent/register', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    }, env);
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowedMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowedMethods).toMatch(/POST/);
    const allowedHeaders = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowedHeaders.toLowerCase()).toContain('authorization');
  });
});

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Public OAuth demo client provisioner.
//
// Writes a single client record to KV with a deliberately-public client_secret
// so the OAuth demo page at /demo/oauth can run the full flow without asking
// visitors to paste anything. Scopes are read-only and gate no sensitive data,
// matching the same "synthetic demo route" model the /x402 and /mpp endpoints
// already follow with their placeholder treasury addresses.
//
// THE client_secret IS PUBLIC BY DESIGN. It is embedded in the demo page HTML.
// Anyone can request tokens scoped to `spec:read` / `mcp:tools`. The MCP server
// already serves those resources without authentication, so this grants no
// privilege over what an unauthenticated agent already has.
//
// Usage:
//   node scripts/provision-demo-public-client.mjs | bash
//
// To rotate the embedded secret, change DEMO_PUBLIC_CLIENT_SECRET below, change
// the matching constant in the /demo/oauth.astro source, and run this script
// again. Rotation is a code change followed by a re-deploy of the auth worker
// (this script does both halves: KV write + the matching demo page is in repo).
//
// ─── WARNING: the iteration count below MUST equal the worker's count ──────
// The PBKDF2 iteration count in this script and the count in
// `app/auth/src/oauth-jwt.ts` `hashClientSecret` are independent constants.
// The stored hash carries no iteration metadata; verification only succeeds
// when both halves agree. If you change the count in either file:
//
//   1. Change the matching constant in the OTHER file.
//   2. Re-run this script (and `provision-oauth-client.mjs` for every real
//      client) to overwrite every stored KV record with a fresh hash.
//
// Skip step 2 and every token request returns `401 invalid_client` even
// though the KV key clearly exists. The runtime emits no error in tail;
// diagnosis means reproducing the hash offline at varying counts. We have
// already paid that diagnostic cost once. See
// docs/CHANGELOG-2026-05-14-oauth2-demo-stale-kv-hash-fix.md.
// ─────────────────────────────────────────────────────────────────────────────

import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto

// These two constants are the ONLY canonical source for the public demo
// credentials. The demo page imports the same client_id and embeds the same
// secret. If you change them here, change them in /demo/oauth.astro too.
const DEMO_PUBLIC_CLIENT_ID     = 'demo-public'
const DEMO_PUBLIC_CLIENT_SECRET = 'agents-txt-demo-public-credential-not-secret-by-design'
const DEMO_PUBLIC_SCOPES        = ['spec:read', 'mcp:tools']

function b64urlEncode(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

async function hashClientSecret(secret) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  // 100,000 iterations to match the worker's PBKDF2 cap. Cloudflare Workers'
  // Web Crypto rejects iteration counts above 100,000 with NotSupportedError,
  // so the script must use the same ceiling for the hash to be verifiable.
  const derivedBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const out = new Uint8Array(salt.length + 32)
  out.set(salt, 0)
  out.set(new Uint8Array(derivedBits), salt.length)
  return b64urlEncode(out)
}

const record = {
  hashed_secret: await hashClientSecret(DEMO_PUBLIC_CLIENT_SECRET),
  scopes:        DEMO_PUBLIC_SCOPES,
  created_at:    Date.now(),
  name:          'Public demo client (intentionally exposed for /demo/oauth)',
}

process.stderr.write(`
─────────────────────────────────────────────────────────────
Public OAuth demo client provisioned
─────────────────────────────────────────────────────────────
  client_id:     ${DEMO_PUBLIC_CLIENT_ID}
  client_secret: ${DEMO_PUBLIC_CLIENT_SECRET}
  scopes:        ${DEMO_PUBLIC_SCOPES.join(' ')}
─────────────────────────────────────────────────────────────

This credential is PUBLIC BY DESIGN. It is embedded in the
/demo/oauth.astro source so the demo runs out of the box for
any visitor without asking them to paste anything. Tokens it
issues are scoped to read-only data the MCP server already
exposes unauthenticated. No privilege escalation possible.

Run the command on stdout to write the record:

  $ node scripts/provision-demo-public-client.mjs | bash

`)

// `--remote` is REQUIRED in wrangler v4: `kv key` commands default to the
// local Miniflare KV emulator now. Without it, the record is written to a
// local file on the operator's machine and the deployed worker can't read it.
const recordJson = JSON.stringify(record)
process.stdout.write(
  `npx wrangler kv key put --binding=AUTH_KV --env production --remote "oauth:client:${DEMO_PUBLIC_CLIENT_ID}" '${recordJson}'\n`,
)

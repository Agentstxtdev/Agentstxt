import type { JwtPayload } from './types.js';

function base64urlToUint8Array(b64url: string): Uint8Array {
  const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
  const b64 = pad(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function parseJwt(token: string): { header: Record<string, unknown>; payload: JwtPayload; signedData: string; signature: Uint8Array } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(base64urlToUint8Array(h))) as Record<string, unknown>;
    // Verification is hard-pinned to Ed25519, so a non-EdDSA alg cannot forge a
    // valid signature. Rejecting at parse time is defense-in-depth and means
    // we surface a clean "wrong alg" error instead of a confusing sig failure.
    if (header['alg'] !== 'EdDSA') return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToUint8Array(p))) as JwtPayload;
    return { header, payload, signedData: `${h}.${p}`, signature: base64urlToUint8Array(s) };
  } catch {
    return null;
  }
}

export async function verifyEd25519(signedData: string, signature: Uint8Array, jwk: JsonWebKey): Promise<boolean> {
  try {
    // Strip to minimum OKP fields — workerd's importKey rejects extra Node.js-exported fields (key_ops, ext, use)
    const cleanJwk: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
    const key = await crypto.subtle.importKey('jwk', cleanJwk, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, new TextEncoder().encode(signedData));
  } catch {
    return false;
  }
}

// RFC 7638 JWK thumbprint — canonical JSON for OKP Ed25519: {crv, kty, x}
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function assertClaims(payload: JwtPayload, expectedAudience?: string): string | null {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp < now) return 'token expired';
  if (payload.iat !== undefined && payload.iat > now + 30) return 'token not yet valid';
  if (expectedAudience !== undefined) {
    const aud = payload.aud;
    const matches = typeof aud === 'string'
      ? aud === expectedAudience
      : Array.isArray(aud) && aud.includes(expectedAudience);
    if (!matches) return 'audience mismatch';
  }
  return null;
}

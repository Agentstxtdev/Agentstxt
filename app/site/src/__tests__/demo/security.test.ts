// Security invariants for demo pages. The demos are public-facing static HTML
// shipped to every visitor; anything that looks like a leaked secret, an
// insecure-by-default URL, or a hand-rolled crypto primitive is a regression.

import { describe, it, expect } from 'vitest';
import { listDemoNames, readDemo } from './helpers.js';

const DEMOS = listDemoNames();

describe.each(DEMOS)('demo page security: /demo/%s', (name) => {
  const content = readDemo(name);

  it('contains no Stripe-style live secret keys', () => {
    expect(content).not.toMatch(/\b(sk_live_|rk_live_|whsec_)[a-zA-Z0-9]{8,}/);
  });

  it('contains no Stripe-style test secret keys', () => {
    expect(content).not.toMatch(/\bsk_test_[a-zA-Z0-9]{12,}/);
  });

  it('contains no inline PEM private keys', () => {
    expect(content).not.toMatch(/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/);
  });

  it('contains no inline JWK with a private "d" component', () => {
    // Crude but catches a hand-pasted full JWK on a demo page.
    expect(content).not.toMatch(/"kty"\s*:\s*"(EC|OKP|RSA)"[^}]*"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/);
  });

  it('contains no wallet-style EVM addresses (40 hex chars) outside of doc strings about TEMPO_USDC_E', () => {
    // 40-hex EVM wallet pattern. The USDC.e mint constant on Tempo
    // (0x20c0...) is a public contract address, not a wallet — allow it explicitly.
    const allowed = /0x20c0000000000000000000000000000000000000/g;
    const sanitized = content.replace(allowed, '<ALLOWED_TOKEN_CONTRACT>');
    expect(sanitized).not.toMatch(/\b0x[a-fA-F0-9]{40}\b/);
  });

  it('uses only HTTPS for non-localhost external links', () => {
    // Pull every http:// URL and confirm it points at localhost (dev-mode docs).
    const httpUrls = content.match(/\bhttp:\/\/[^\s"'<>)]+/g) ?? [];
    for (const url of httpUrls) {
      expect(url).toMatch(/\bhttp:\/\/localhost\b/);
    }
  });

  it('has no obvious XSS sink (no `innerHTML = ` with template literal interpolation of user input)', () => {
    // Heuristic: forbid `.innerHTML =` followed by a template literal that interpolates a fetched value.
    // Astro escapes its own template output; the danger zone is inline scripts.
    expect(content).not.toMatch(/\.innerHTML\s*=\s*`[^`]*\$\{[^}]*(?:input|query|location|search|hash)[^}]*\}/);
  });

  it('does not invoke crypto.subtle with hand-rolled algorithm strings (must use string literals from the WebCrypto enum)', () => {
    // Catches typos like `algorithm: "Ed2551"` that would silently fall back to unspecified behaviour.
    // The set below mirrors the algorithms actually used across the demos.
    const cryptoCalls = content.match(/crypto\.subtle\.(generateKey|sign|verify|importKey|exportKey|deriveBits|digest)\([^)]+\)/g) ?? [];
    for (const call of cryptoCalls) {
      // Each call must reference at least one recognised algorithm name (or PBKDF2 / SHA-256).
      const hasKnown = /(Ed25519|EdDSA|ECDSA|ECDH|RSASSA|RSA-OAEP|AES-|HMAC|PBKDF2|SHA-256|SHA-384|SHA-512|HKDF|raw|jwk|spki|pkcs8)/.test(call);
      expect(hasKnown, `crypto call without recognised algorithm: ${call}`).toBe(true);
    }
  });
});

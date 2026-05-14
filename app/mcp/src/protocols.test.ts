import { describe, it, expect } from 'vitest';
import {
  PAYMENT_PROTOCOLS,
  AUTH_PROTOCOLS,
  MPP_METHODS,
  BLOCK_OPENERS,
  BLOCK_BODY_DIRECTIVES,
  isExperimentalIdentifier,
  isKnownPaymentProtocol,
  isKnownAuthProtocol,
  isAcceptedPaymentIdentifier,
  isAcceptedAuthIdentifier,
} from './protocols.js';

describe('protocol registries', () => {
  it('PAYMENT_PROTOCOLS contains the canonical identifiers', () => {
    expect(PAYMENT_PROTOCOLS).toEqual(['x402', 'mpp', 'ap2']);
  });

  it('AUTH_PROTOCOLS contains the canonical identifiers', () => {
    expect(AUTH_PROTOCOLS).toEqual(['agent-auth', 'oauth2']);
  });

  it('MPP_METHODS contains the canonical methods', () => {
    expect(MPP_METHODS).toEqual(['tempo', 'stripe']);
  });

  it('BLOCK_OPENERS maps every directive to its block kind', () => {
    expect(BLOCK_OPENERS).toEqual({
      Protocols: 'payments',
      Authorization: 'authorization',
      MCP: 'mcp',
      Skills: 'skills',
      A2A: 'a2a',
      UCP: 'ucp',
    });
  });

  it('BLOCK_BODY_DIRECTIVES lists body-only directives', () => {
    expect(BLOCK_BODY_DIRECTIVES.has('Payments')).toBe(true);
    expect(BLOCK_BODY_DIRECTIVES.has('Identity')).toBe(true);
    expect(BLOCK_BODY_DIRECTIVES.has('Protocols')).toBe(false);
  });
});

describe('isExperimentalIdentifier', () => {
  it('accepts the x- prefix with at least one character after', () => {
    expect(isExperimentalIdentifier('x-mypay')).toBe(true);
    expect(isExperimentalIdentifier('x-a')).toBe(true);
  });

  it('rejects the bare prefix with no identifier body', () => {
    expect(isExperimentalIdentifier('x-')).toBe(false);
  });

  it('rejects identifiers that do not start with x-', () => {
    expect(isExperimentalIdentifier('mypay')).toBe(false);
    expect(isExperimentalIdentifier('X-mypay')).toBe(false); // case-sensitive per spec
    expect(isExperimentalIdentifier('')).toBe(false);
  });

  it('does not crash on Unicode or symbols (caller decides format)', () => {
    expect(isExperimentalIdentifier('x-数字')).toBe(true);
  });
});

describe('isKnownPaymentProtocol / isKnownAuthProtocol', () => {
  it('accepts every registered payment identifier', () => {
    for (const id of PAYMENT_PROTOCOLS) {
      expect(isKnownPaymentProtocol(id)).toBe(true);
    }
  });

  it('rejects unknown identifiers including x- experimental ones (those are accepted but not known)', () => {
    expect(isKnownPaymentProtocol('x-mypay')).toBe(false);
    expect(isKnownPaymentProtocol('paypal')).toBe(false);
    expect(isKnownPaymentProtocol('')).toBe(false);
  });

  it('accepts every registered auth identifier and rejects others', () => {
    for (const id of AUTH_PROTOCOLS) expect(isKnownAuthProtocol(id)).toBe(true);
    expect(isKnownAuthProtocol('basic')).toBe(false);
    expect(isKnownAuthProtocol('x-myauth')).toBe(false);
  });
});

describe('isAcceptedPaymentIdentifier / isAcceptedAuthIdentifier', () => {
  it('accepts both registered and x-prefixed payment identifiers', () => {
    expect(isAcceptedPaymentIdentifier('x402')).toBe(true);
    expect(isAcceptedPaymentIdentifier('x-mypay')).toBe(true);
  });

  it('rejects unknown non-experimental identifiers (parser warning, not accepted)', () => {
    expect(isAcceptedPaymentIdentifier('paypal')).toBe(false);
    expect(isAcceptedPaymentIdentifier('x-')).toBe(false);
    expect(isAcceptedPaymentIdentifier('')).toBe(false);
  });

  it('mirrors the same behaviour for auth identifiers', () => {
    expect(isAcceptedAuthIdentifier('oauth2')).toBe(true);
    expect(isAcceptedAuthIdentifier('x-zero-knowledge')).toBe(true);
    expect(isAcceptedAuthIdentifier('basic')).toBe(false);
  });
});

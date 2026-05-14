// Edge-case coverage for assertClaims that complements jwt.test.ts (which
// focuses on iat/exp). This file targets the audience-matching branch.

import { describe, it, expect } from 'vitest';
import { assertClaims } from '../jwt.js';

describe('assertClaims — audience matching', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it('returns null when expectedAudience matches a string aud', () => {
    expect(assertClaims({ aud: 'https://example.com/x', iat: now(), exp: now() + 60 }, 'https://example.com/x')).toBeNull();
  });

  it('returns "audience mismatch" when string aud differs', () => {
    expect(assertClaims({ aud: 'https://example.com/x' }, 'https://example.com/y')).toBe('audience mismatch');
  });

  it('returns null when expectedAudience is in an array aud', () => {
    expect(assertClaims({ aud: ['https://a.example', 'https://b.example'] }, 'https://b.example')).toBeNull();
  });

  it('returns "audience mismatch" when expectedAudience is not in the array', () => {
    expect(assertClaims({ aud: ['https://a.example'] }, 'https://b.example')).toBe('audience mismatch');
  });

  it('returns "audience mismatch" when aud is missing entirely', () => {
    expect(assertClaims({}, 'https://example.com')).toBe('audience mismatch');
  });

  it('skips audience check when expectedAudience is undefined', () => {
    expect(assertClaims({ aud: 'whatever' })).toBeNull();
  });

  it('does not match an empty-array aud against any expected value', () => {
    expect(assertClaims({ aud: [] }, 'https://example.com')).toBe('audience mismatch');
  });
});

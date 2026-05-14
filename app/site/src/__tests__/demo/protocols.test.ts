// Each demo page describes a specific protocol. These tests pin the protocol
// identifier inside the page so a refactor cannot silently swap MCP content
// onto the OAuth page or vice versa. The match is loose (case-insensitive,
// includes either canonical name or wire-level identifier) so cosmetic edits
// don't break the test, but cross-wiring does.

import { describe, it, expect } from 'vitest';
import { readDemo } from './helpers.js';

const MATCHERS: Record<string, RegExp[]> = {
  a2a:       [/A2A/, /AgentCard|skills/i],
  auth:      [/agent-?auth/i, /Ed25519|EdDSA/i],
  generate:  [/agents\.txt|agents\.json/, /generate|generator|wizard/i],
  llms:      [/llms[-.]?(full[-.]?)?txt/i],
  mcp:       [/MCP|Model Context Protocol/i, /tools|streamable-http/i],
  mpp:       [/\bMPP\b|Machine Payments Protocol/i],
  oauth:     [/OAuth|client[-_\s]credentials/i, /ES256|JWKS/i],
  payments:  [/x402/i, /402 Payment Required|payTo|facilitator/i],
  skills:    [/SKILL\.md|agentskills/i],
  ucp:       [/UCP|Universal Capability Protocol/i],
};

describe.each(Object.entries(MATCHERS))('demo page protocol identity: /demo/%s', (name, matchers) => {
  const content = readDemo(name);

  it.each(matchers.map((m, i) => [i, m] as const))(
    'matches protocol marker #%i (%s)',
    (_i, regex) => {
      expect(content).toMatch(regex);
    },
  );
});

describe('cross-wiring guard', () => {
  it('the auth demo does NOT advertise ES256 (that is OAuth, not agent-auth)', () => {
    const content = readDemo('auth');
    // agent-auth is Ed25519. ES256 here would indicate cross-pollution.
    expect(content).not.toMatch(/\bES256\b/);
  });

  it('the oauth demo does NOT mention Ed25519 as its core algorithm', () => {
    const content = readDemo('oauth');
    // OAuth here uses ES256. Ed25519 would indicate cross-pollution.
    expect(content).not.toMatch(/\bEd25519\b/);
  });

  it('the payments demo does NOT advertise an MPP challenge endpoint', () => {
    const content = readDemo('payments');
    // /mpp belongs to the mpp demo. /x402 is the payments demo's surface.
    // Allow the word "MPP" inside hyperlink text/comparisons; forbid the actual route.
    expect(content).not.toMatch(/['"`]\/mpp['"`]/);
  });

  it('the mpp demo does NOT advertise the /x402 route as its primary surface', () => {
    const content = readDemo('mpp');
    expect(content).not.toMatch(/['"`]\/x402['"`]/);
  });
});

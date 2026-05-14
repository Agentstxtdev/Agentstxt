import { describe, it, expect } from 'vitest';
import { parseAgentsTxt } from './parse_agents_txt.js';
import { captureTools, jsonOf } from '../__tests__/helpers.js';
import { registerParseAgentsTxt } from './parse_agents_txt.js';

describe('parseAgentsTxt', () => {
  it('returns an empty shape for an empty input', () => {
    const parsed = parseAgentsTxt('');
    expect(parsed).toEqual({ mcp: [], skills: [], a2a: [], ucp: [], extensions: {} });
  });

  it('ignores comments and blank lines', () => {
    const parsed = parseAgentsTxt(`
# A comment
   # Indented comment

MCP: https://example.com/mcp
`);
    expect(parsed.mcp).toEqual(['https://example.com/mcp']);
    expect(parsed.extensions).toEqual({});
  });

  it('parses a complete spec-compliant file', () => {
    const txt = [
      '# JSON: https://example.com/agents.json',
      'Protocols: x402, mpp',
      'Payments: required',
      'Authorization: agent-auth, oauth2',
      'Identity: required',
      'MCP: https://example.com/mcp',
      'MCP: https://example.com/mcp2',
      'Skills: https://example.com/skills/foo/SKILL.md',
      'A2A: https://example.com/a2a',
      'UCP: https://example.com/ucp',
    ].join('\n');
    const parsed = parseAgentsTxt(txt);
    expect(parsed.payments).toEqual({ protocols: ['x402', 'mpp'], required: true });
    expect(parsed.authorization).toEqual({ protocols: ['agent-auth', 'oauth2'], identity: 'required' });
    expect(parsed.mcp).toEqual(['https://example.com/mcp', 'https://example.com/mcp2']);
    expect(parsed.skills).toEqual(['https://example.com/skills/foo/SKILL.md']);
    expect(parsed.a2a).toEqual(['https://example.com/a2a']);
    expect(parsed.ucp).toEqual(['https://example.com/ucp']);
    expect(parsed.extensions).toEqual({});
  });

  it('drops the payments block when Protocols: line is empty', () => {
    const parsed = parseAgentsTxt('Payments: required\n');
    expect(parsed.payments).toBeUndefined();
  });

  it('drops the payments block when Protocols: produces no entries', () => {
    const parsed = parseAgentsTxt('Protocols:   \n');
    expect(parsed.payments).toBeUndefined();
  });

  it('trims surrounding whitespace from directive values and list items', () => {
    const parsed = parseAgentsTxt('   Protocols:   x402 ,  mpp   \n');
    expect(parsed.payments?.protocols).toEqual(['x402', 'mpp']);
  });

  it('ignores trailing commas / empty items in lists', () => {
    const parsed = parseAgentsTxt('Protocols: x402, , mpp,\n');
    expect(parsed.payments?.protocols).toEqual(['x402', 'mpp']);
  });

  it('Payments: required without a Protocols: line yields no payments block (no protocols → dropped)', () => {
    const parsed = parseAgentsTxt('Payments: required\n');
    expect(parsed.payments).toBeUndefined();
  });

  it('Payments: required combines with a Protocols: line in either order', () => {
    const before = parseAgentsTxt('Payments: required\nProtocols: x402\n');
    const after = parseAgentsTxt('Protocols: x402\nPayments: required\n');
    expect(before.payments).toEqual({ protocols: ['x402'], required: true });
    expect(after.payments).toEqual({ protocols: ['x402'], required: true });
  });

  it('Payments: with a value other than "required" is silently ignored', () => {
    const parsed = parseAgentsTxt('Protocols: x402\nPayments: optional\n');
    expect(parsed.payments).toEqual({ protocols: ['x402'] });
  });

  it('Identity: with a value other than "required" is silently ignored', () => {
    const parsed = parseAgentsTxt('Authorization: agent-auth\nIdentity: optional\n');
    expect(parsed.authorization).toEqual({ protocols: ['agent-auth'] });
  });

  it('preserves experimental x- prefixed identifiers in lists (parser is permissive)', () => {
    const parsed = parseAgentsTxt('Protocols: x402, x-mypay\nAuthorization: oauth2, x-myauth\n');
    expect(parsed.payments?.protocols).toEqual(['x402', 'x-mypay']);
    expect(parsed.authorization?.protocols).toEqual(['oauth2', 'x-myauth']);
  });

  it('captures unknown top-level directives under extensions (forward-compat)', () => {
    const parsed = parseAgentsTxt('Foo: bar\nFoo: baz\nQuux: zonk\n');
    expect(parsed.extensions).toEqual({ Foo: ['bar', 'baz'], Quux: ['zonk'] });
  });

  it('does NOT add known body directives to extensions; Identity outside of an Authorization: line still opens an authorization record', () => {
    // Identity: is a known body directive, so it never falls into `extensions`.
    // The current parser also opens an authorization record on first Identity:
    // encounter, leaving protocols empty until a real Authorization: line arrives.
    const parsed = parseAgentsTxt('Identity: required\n');
    expect(parsed.extensions).toEqual({});
    expect(parsed.authorization).toEqual({ protocols: [], identity: 'required' });
  });

  it('repeated MCP / Skills / A2A / UCP lines accumulate in declaration order', () => {
    const parsed = parseAgentsTxt([
      'MCP: https://a/mcp',
      'MCP: https://b/mcp',
      'Skills: https://a/s/SKILL.md',
      'A2A: https://a/a2a',
      'UCP: https://a/ucp',
    ].join('\n'));
    expect(parsed.mcp).toEqual(['https://a/mcp', 'https://b/mcp']);
    expect(parsed.skills).toEqual(['https://a/s/SKILL.md']);
    expect(parsed.a2a).toEqual(['https://a/a2a']);
    expect(parsed.ucp).toEqual(['https://a/ucp']);
  });

  it('lines without a colon are skipped silently', () => {
    const parsed = parseAgentsTxt('this is not a directive\nMCP: https://a/mcp\n');
    expect(parsed.mcp).toEqual(['https://a/mcp']);
    expect(parsed.extensions).toEqual({});
  });

  it('handles CRLF line endings', () => {
    const parsed = parseAgentsTxt('MCP: https://a/mcp\r\nSkills: https://a/s/SKILL.md\r\n');
    // \r remains at end of value because we trim() each line. The trim covers \r.
    expect(parsed.mcp).toEqual(['https://a/mcp']);
    expect(parsed.skills).toEqual(['https://a/s/SKILL.md']);
  });

  it('preserves values with embedded colons (only the first colon splits)', () => {
    const parsed = parseAgentsTxt('MCP: https://example.com:8443/mcp\n');
    expect(parsed.mcp).toEqual(['https://example.com:8443/mcp']);
  });

  it('is case-sensitive on directive keys (mcp != MCP)', () => {
    const parsed = parseAgentsTxt('mcp: https://example.com/mcp\n');
    expect(parsed.mcp).toEqual([]);
    expect(parsed.extensions).toEqual({ mcp: ['https://example.com/mcp'] });
  });

  it('does not crash on a payload of only colons or whitespace', () => {
    expect(() => parseAgentsTxt('::::\n     \n')).not.toThrow();
  });
});

describe('registerParseAgentsTxt (MCP tool wrapper)', () => {
  it('returns parsed structure as JSON text', () => {
    const { server, tools } = captureTools();
    registerParseAgentsTxt(server);
    expect(tools.parse_agents_txt).toBeDefined();
    const result = tools.parse_agents_txt.handler({ content: 'MCP: https://a/mcp\n' });
    const parsed = jsonOf(result);
    expect(parsed.mcp).toEqual(['https://a/mcp']);
  });
});

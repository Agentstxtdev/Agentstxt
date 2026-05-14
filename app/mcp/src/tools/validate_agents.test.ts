import { describe, it, expect, beforeEach } from 'vitest';
import { registerValidateAgents } from './validate_agents.js';
import { captureTools, jsonOf, type CapturedTool } from '../__tests__/helpers.js';

type ValidationResult = { valid: boolean; errors: string[]; warnings: string[]; notes: string[] };

let txtTool: CapturedTool;
let jsonTool: CapturedTool;

beforeEach(() => {
  const { server, tools } = captureTools();
  registerValidateAgents(server);
  txtTool = tools.validate_agents_txt;
  jsonTool = tools.validate_agents_json;
});

const runTxt = (content: string): ValidationResult => jsonOf(txtTool.handler({ content }));
const runJson = (content: string): ValidationResult => jsonOf(jsonTool.handler({ content }));

describe('validate_agents_txt — happy path', () => {
  it('returns valid for a minimal spec-compliant file', () => {
    const r = runTxt('MCP: https://example.com/mcp\n');
    expect(r).toEqual({ valid: true, errors: [], warnings: [], notes: [] });
  });

  it('returns valid for a complete file', () => {
    const txt = [
      'Protocols: x402, mpp',
      'Payments: required',
      'Authorization: agent-auth',
      'Identity: required',
      'MCP: https://example.com/mcp',
      'Skills: https://example.com/skills/foo/SKILL.md',
      'A2A: https://example.com/a2a',
      'UCP: https://example.com/ucp',
    ].join('\n');
    expect(runTxt(txt)).toEqual({ valid: true, errors: [], warnings: [], notes: [] });
  });
});

describe('validate_agents_txt — errors', () => {
  it('rejects non-HTTPS MCP URLs as errors', () => {
    const r = runTxt('MCP: http://example.com/mcp\n');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /MCP URL must be a valid HTTPS URL/.test(e))).toBe(true);
  });

  it('rejects malformed URLs in every URL-bearing directive', () => {
    const r = runTxt([
      'MCP: not-a-url',
      'Skills: also-not-a-url',
      'A2A: nope',
      'UCP: still-not',
    ].join('\n'));
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(4);
  });

  it('does NOT flag an empty Protocols: line at the validator (parser drops the payments block)', () => {
    // parseAgentsTxt deletes payments when protocols is empty, so the validator's empty-check is unreachable
    // via the public surface. This documents that current behaviour.
    const r = runTxt('Protocols:\n');
    expect(r.errors).not.toContain(
      'Payments block requires a non-empty Protocols: line with at least one protocol identifier',
    );
  });
});

describe('validate_agents_txt — warnings', () => {
  it('warns on unknown non-experimental payment identifiers', () => {
    const r = runTxt('Protocols: paypal\n');
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /Unknown payment protocol "paypal"/.test(w))).toBe(true);
  });

  it('does NOT warn on x- prefixed experimental payment identifiers', () => {
    const r = runTxt('Protocols: x-mypay\n');
    expect(r.warnings).toEqual([]);
  });

  it('warns on unknown authorization protocols but accepts x- prefix', () => {
    const r1 = runTxt('Authorization: basic\n');
    expect(r1.warnings.some((w) => /Unknown authorization protocol "basic"/.test(w))).toBe(true);
    const r2 = runTxt('Authorization: x-myauth\n');
    expect(r2.warnings).toEqual([]);
  });

  it('warns on unknown directives surfaced through extensions', () => {
    const r = runTxt('CustomDirective: value\n');
    expect(r.warnings.some((w) => /Unknown directive "CustomDirective:"/.test(w))).toBe(true);
  });
});

describe('validate_agents_json — top-level shape', () => {
  it('rejects invalid JSON with an Invalid JSON error', () => {
    const r = runJson('this is not json');
    expect(r).toEqual({ valid: false, errors: ['Invalid JSON'], warnings: [], notes: [] });
  });

  it('rejects null and primitive JSON values', () => {
    // Note: `typeof [] === 'object'`, so the current validator accepts arrays
    // and only fails downstream field checks. The "must be a JSON object" error
    // fires only for `null` and JSON primitives.
    expect(runJson('"hi"').errors).toContain('agents.json must be a JSON object');
    expect(runJson('42').errors).toContain('agents.json must be a JSON object');
    expect(runJson('null').errors).toContain('agents.json must be a JSON object');
  });

  it('arrays slip past the object check but fail field-level validation', () => {
    const r = runJson('[]');
    expect(r.warnings.some((w) => /Missing "version"/.test(w))).toBe(true);
  });

  it('surfaces a positive note when $schema is present and a string', () => {
    const r = runJson(JSON.stringify({
      $schema: 'https://agentstxt.dev/schema/agents-json/v1.0.json',
      version: '1.0',
      standard: 'https://agentstxt.dev',
      site: { name: 'X', url: 'https://example.com' },
    }));
    expect(r.notes.some((n) => /Schema reference present/.test(n))).toBe(true);
  });

  it('warns when $schema is present but not a string', () => {
    const r = runJson(JSON.stringify({ $schema: 42, version: '1.0', standard: 'https://agentstxt.dev', site: { name: 'X', url: 'https://example.com' } }));
    expect(r.warnings.some((w) => /\$schema.*not a string/.test(w))).toBe(true);
  });

  it('warns (nudge) when $schema is absent so operators learn about editor autocomplete', () => {
    const r = runJson('{}');
    expect(r.warnings.some((w) => /No "\$schema" field/.test(w))).toBe(true);
  });

  it('warns about missing top-level fields without failing', () => {
    const r = runJson('{}');
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing "version"'),
        expect.stringContaining('Missing "standard"'),
        expect.stringContaining('Missing "site"'),
      ]),
    );
  });
});

describe('validate_agents_json — payments block', () => {
  it('rejects payments with no recognised per-protocol object', () => {
    const r = runJson(JSON.stringify({ version: '0.5', standard: 'https://agentstxt.dev', payments: {} }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /"payments" must include at least one per-protocol object/.test(e))).toBe(true);
  });

  it('accepts payments with a known protocol object', () => {
    const r = runJson(JSON.stringify({ payments: { x402: {} } }));
    expect(r.errors).not.toContain(expect.stringContaining('"payments" must include'));
  });

  it('accepts payments with an x- experimental key', () => {
    const r = runJson(JSON.stringify({ payments: { 'x-mypay': {} } }));
    expect(r.valid).toBe(true);
  });

  it('rejects non-boolean payments.required', () => {
    const r = runJson(JSON.stringify({ payments: { x402: {}, required: 'yes' } }));
    expect(r.errors).toContain('"payments.required" must be a boolean when present');
  });

  it('rejects empty mpp.methods array', () => {
    const r = runJson(JSON.stringify({ payments: { mpp: { methods: [] } } }));
    expect(r.errors).toContain('"payments.mpp.methods" must be a non-empty array when present');
  });

  it('warns on unrecognised mpp methods', () => {
    const r = runJson(JSON.stringify({ payments: { mpp: { methods: ['paypal'] } } }));
    expect(r.warnings.some((w) => /Unrecognised MPP method "paypal"/.test(w))).toBe(true);
  });

  it('accepts known mpp methods without warnings', () => {
    const r = runJson(JSON.stringify({ payments: { mpp: { methods: ['tempo', 'stripe'] } } }));
    expect(r.warnings.some((w) => /Unrecognised MPP method/.test(w))).toBe(false);
  });
});

describe('validate_agents_json — array-shaped capability blocks', () => {
  const arrayBlocks = ['mcp', 'skills', 'a2a', 'ucp'] as const;

  for (const key of arrayBlocks) {
    it(`rejects non-array "${key}"`, () => {
      const r = runJson(JSON.stringify({ [key]: 'not-an-array' }));
      expect(r.errors).toContain(`"${key}" must be an array`);
    });

    it(`rejects "${key}" entries without a url field`, () => {
      const r = runJson(JSON.stringify({ [key]: [{ description: 'oops' }] }));
      expect(r.errors).toContain(`Each ${key} entry must have a "url" field`);
    });

    it(`rejects "${key}" entries with a non-HTTPS url`, () => {
      const r = runJson(JSON.stringify({ [key]: [{ url: 'ftp://example.com' }] }));
      expect(r.errors.some((e) => e.includes(`${key}[].url must be a valid HTTPS URL`))).toBe(true);
    });

    it(`accepts "${key}" entries with an HTTPS url`, () => {
      const r = runJson(JSON.stringify({ [key]: [{ url: 'https://example.com/x' }] }));
      expect(r.errors.some((e) => e.includes(`${key}[].url`))).toBe(false);
    });
  }

  it('warns when mcp[].type is not "streamable-http"', () => {
    const r = runJson(JSON.stringify({ mcp: [{ url: 'https://example.com/mcp', type: 'sse' }] }));
    expect(r.warnings.some((w) => /mcp\[\]\.type should be "streamable-http"/.test(w))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-validator agreement test (MCP-worker side).
//
// Runs this worker's `validate_agents_json` tool against the same fixture
// corpus exercised by the canonical Zod schema in @agentstxtdev/herald-schema
// and herald-core's hand-written validateAgentsJson. Three independent
// validator implementations agreeing on every fixture is the consumer-side
// guarantee that the wire-format declaration stays consistent across the
// reference deployment and the toolkit.
//
// The fixture corpus lives in two places (here and in
// agentify/packages/schema/src/__tests__/fixtures/). A sync check at
// scripts/sync-check-fixtures.mjs (in the herald monorepo) asserts byte
// equality between the two copies.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerValidateAgents } from '../tools/validate_agents.js';
import { captureTools, jsonOf, type CapturedTool } from './helpers.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

type Fixture = { name: string; expectedValid: boolean; raw: string };

function loadCorpus(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .map((name: string): Fixture => {
      let expectedValid: boolean;
      if (name.startsWith('valid-')) expectedValid = true;
      else if (name.startsWith('invalid-')) expectedValid = false;
      else throw new Error(`Fixture "${name}" must start with "valid-" or "invalid-".`);
      return { name, expectedValid, raw: readFileSync(join(FIXTURES_DIR, name), 'utf8') };
    })
    .sort((a: Fixture, b: Fixture) => a.name.localeCompare(b.name));
}

const corpus = loadCorpus();

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  notes: string[];
};

describe('cross-validator agreement: MCP validate_agents_json vs the shared corpus', () => {
  let jsonTool: CapturedTool;

  beforeEach(() => {
    const { server, tools } = captureTools();
    registerValidateAgents(server);
    jsonTool = tools.validate_agents_json;
  });

  it('corpus is non-empty and covers both verdicts', () => {
    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.some((f: Fixture) => f.expectedValid)).toBe(true);
    expect(corpus.some((f: Fixture) => !f.expectedValid)).toBe(true);
  });

  it.each(corpus)('$name → MCP verdict matches expected (valid=$expectedValid)', ({ raw, expectedValid }) => {
    const result = jsonOf<ValidationResult>(jsonTool.handler({ content: raw }));
    if (result.valid !== expectedValid) {
      console.error(`MCP errors: ${JSON.stringify(result.errors, null, 2)}`);
    }
    expect(result.valid).toBe(expectedValid);
  });

  it('every fixture is parseable JSON (precondition for the verdict test to be meaningful)', () => {
    for (const f of corpus) {
      expect(() => JSON.parse(f.raw)).not.toThrow();
    }
  });
});

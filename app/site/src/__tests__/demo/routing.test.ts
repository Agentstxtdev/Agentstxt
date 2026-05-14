// The site worker uses a PAGE_PATHS regex to decide which paths are eligible
// for `Accept: text/markdown` content negotiation. If a demo page exists but
// the regex doesn't match its path, the markdown fallback silently breaks for
// that demo. Re-derive the regex from source and prove it covers every demo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listDemoNames } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, '..', '..', 'worker.ts');

function extractPagePathsRegex(): RegExp {
  const src = readFileSync(WORKER_PATH, 'utf8');
  // Match: const PAGE_PATHS = /^\/(spec|demo(\/[^/]+)?)?$/;
  const match = src.match(/PAGE_PATHS\s*=\s*(\/[^;]+\/)/);
  if (!match) throw new Error('PAGE_PATHS regex not found in worker.ts');
  // The captured literal is the regex source including its delimiters and flags.
  const literal = match[1]!;
  const body = literal.slice(1, literal.lastIndexOf('/'));
  const flags = literal.slice(literal.lastIndexOf('/') + 1);
  return new RegExp(body, flags);
}

const PAGE_PATHS = extractPagePathsRegex();
const DEMOS = listDemoNames();

describe('worker PAGE_PATHS regex', () => {
  it('matches the bare /demo index path', () => {
    expect(PAGE_PATHS.test('/demo')).toBe(true);
  });

  it('matches the root path', () => {
    expect(PAGE_PATHS.test('/')).toBe(true);
  });

  it('matches /spec', () => {
    expect(PAGE_PATHS.test('/spec')).toBe(true);
  });

  it.each(DEMOS)('matches /demo/%s', (name) => {
    expect(PAGE_PATHS.test(`/demo/${name}`)).toBe(true);
  });

  it('does NOT match nested paths beneath /demo/<name>', () => {
    // Two levels deep would shadow future no-extension routes like /demo/x/api.
    expect(PAGE_PATHS.test('/demo/auth/details')).toBe(false);
  });

  it('does NOT match arbitrary other paths', () => {
    for (const path of ['/x402', '/mpp', '/audit', '/agents.txt', '/agents.json', '/.well-known/jwks.json']) {
      expect(PAGE_PATHS.test(path)).toBe(false);
    }
  });

  it('does NOT match /index.html (the static asset path)', () => {
    // /index.html has a slash before the dot, so the demo-name capture group
    // cannot match it. Documents that the regex does not shadow the home page.
    expect(PAGE_PATHS.test('/index.html')).toBe(false);
  });

  it('intentionally matches /demo/<name>.html — the [^/]+ capture is permissive', () => {
    // The PAGE_PATHS regex allows dots inside the demo-name segment so paths
    // like /demo/auth.html would be eligible for markdown negotiation. This is
    // accepted: env.ASSETS serves the static .html file by default, and the
    // markdown negotiation branch only fires when Accept: text/markdown is set.
    expect(PAGE_PATHS.test('/demo/auth.html')).toBe(true);
  });
});

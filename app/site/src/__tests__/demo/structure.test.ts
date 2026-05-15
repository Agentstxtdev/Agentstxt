// Structural invariants for every demo page. Each demo is an Astro template
// that wraps a BaseLayout, declares SEO metadata, and embeds an inline-script
// demo runner. These tests catch refactors that accidentally break the shared
// shape (missing canonical URL, dropped BaseLayout, mismatched script tags).

import { describe, it, expect } from 'vitest';
import { listDemoNames, readDemo, extractFrontmatter, stripFrontmatter, attrValue } from './helpers.js';

const DEMOS = listDemoNames();

describe('demo pages: file presence', () => {
  it('lists the expected set of demo pages', () => {
    // Locks the demo roster; adding or removing a demo is intentional and should
    // be a deliberate edit to this assertion (not a silent regression).
    expect(DEMOS).toEqual([
      'a2a',
      'auth',
      'generate',
      'llms',
      'mcp',
      'mpp',
      'oauth',
      'payments',
      'skills',
      'ucp',
    ]);
  });
});

describe.each(DEMOS)('demo page: /demo/%s', (name) => {
  const content = readDemo(name);

  it('has an Astro frontmatter block', () => {
    expect(content.startsWith('---\n')).toBe(true);
    expect(extractFrontmatter(content).length).toBeGreaterThan(0);
  });

  it('imports BaseLayout via the expected relative path', () => {
    const fm = extractFrontmatter(content);
    expect(fm).toMatch(/from\s+['"]\.\.\/\.\.\/layouts\/BaseLayout\.astro['"]/);
  });

  it('wraps content in a <BaseLayout> element', () => {
    const body = stripFrontmatter(content);
    expect(body).toMatch(/<BaseLayout[\s>]/);
    expect(body).toMatch(/<\/BaseLayout>/);
  });

  it('declares title and description attributes on BaseLayout', () => {
    expect(attrValue(content, 'title')).toBeTruthy();
    expect(attrValue(content, 'description')).toBeTruthy();
  });

  it('title contains "agents.txt" branding', () => {
    expect(attrValue(content, 'title')).toMatch(/agents\.txt/);
  });

  it('description is at least 80 characters (SEO floor)', () => {
    const desc = attrValue(content, 'description');
    expect(desc).not.toBeNull();
    expect(desc!.length).toBeGreaterThanOrEqual(80);
  });

  it(`canonicalUrl points to https://agents-txt.com/demo/${name}`, () => {
    expect(attrValue(content, 'canonicalUrl')).toBe(`https://agents-txt.com/demo/${name}`);
  });

  it('includes the shared NavRight component', () => {
    expect(content).toMatch(/<NavRight[\s/>]/);
  });

  it('has balanced <script> tags', () => {
    const opens = (content.match(/<script\b/gi) ?? []).length;
    const closes = (content.match(/<\/script>/gi) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('has at least one <script> block (the demo runner)', () => {
    expect((content.match(/<script\b/gi) ?? []).length).toBeGreaterThan(0);
  });

  it('has balanced opening/closing BaseLayout tags', () => {
    expect((content.match(/<BaseLayout\b/g) ?? []).length).toBe(1);
    expect((content.match(/<\/BaseLayout>/g) ?? []).length).toBe(1);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEMO_DIR = join(HERE, '..', '..', 'pages', 'demo');

export function readDemo(name: string): string {
  return readFileSync(join(DEMO_DIR, `${name}.astro`), 'utf8');
}

export function listDemoNames(): string[] {
  return readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith('.astro'))
    .map((f) => f.replace(/\.astro$/, ''))
    .sort();
}

/**
 * Strip the Astro frontmatter block ("---\n...\n---") so structural checks
 * against the template body don't accidentally match on import paths.
 */
export function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? content.slice(m[0].length) : content;
}

export function extractFrontmatter(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1]! : '';
}

/**
 * Pull the value of a Hono-style JSX attribute, e.g. `canonicalUrl="..."`.
 * Returns null when the attribute is absent.
 */
export function attrValue(content: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}="([^"]*)"`);
  return content.match(re)?.[1] ?? null;
}

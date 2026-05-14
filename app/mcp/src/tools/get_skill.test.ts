import { describe, it, expect, afterEach, vi } from 'vitest';
import { registerGetSkill } from './get_skill.js';
import { captureTools, installFetch, res, textOf } from '../__tests__/helpers.js';

function setup(siteOrigin = 'https://example.com') {
  const { server, tools } = captureTools();
  registerGetSkill(server, siteOrigin);
  return tools.get_skill;
}

afterEach(() => vi.restoreAllMocks());

describe('get_skill — list', () => {
  it('reports "no skills" when agents.json is empty', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) return res('{}');
      return res('', { status: 404 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'list' });
    expect(textOf(out)).toBe('No skills found in agents.json');
  });

  it('lists available skills with descriptions when present', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({
          skills: [
            { url: 'https://example.com/skills/foo/SKILL.md', description: 'Foo skill' },
            { url: 'https://example.com/skills/bar.md' },
          ],
        }));
      }
      return res('', { status: 404 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'list' });
    const text = textOf(out);
    expect(text).toContain('foo: Foo skill');
    expect(text).toContain('bar');
  });

  it('falls back to empty list when agents.json fetch fails', async () => {
    installFetch(() => res('', { status: 500 }));
    const tool = setup();
    const out = await tool.handler({ name: 'list' });
    expect(textOf(out)).toBe('No skills found in agents.json');
  });
});

describe('get_skill — fetch by name', () => {
  it('returns the SKILL.md content for a matching skill', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }] }));
      }
      if (url.endsWith('/skills/foo/SKILL.md')) {
        return res('# Foo skill body');
      }
      return res('', { status: 404 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'foo' });
    expect(textOf(out)).toBe('# Foo skill body');
    expect(out.isError).toBeUndefined();
  });

  it('routes the fetch through siteOrigin even when agents.json advertises a different origin', async () => {
    const seenUrls: string[] = [];
    installFetch((url) => {
      seenUrls.push(url);
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://production.example.com/skills/foo/SKILL.md' }] }));
      }
      if (url === 'https://staging.example.com/skills/foo/SKILL.md') {
        return res('# from staging');
      }
      return res('', { status: 404 });
    });
    const tool = setup('https://staging.example.com');
    const out = await tool.handler({ name: 'foo' });
    expect(textOf(out)).toBe('# from staging');
    expect(seenUrls).toContain('https://staging.example.com/skills/foo/SKILL.md');
  });

  it('returns isError for an unknown skill name', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }] }));
      }
      return res('', { status: 404 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'nope' });
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/not found/);
    expect(textOf(out)).toContain('foo');
  });

  it('returns isError when the SKILL.md fetch returns non-200', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }] }));
      }
      return res('', { status: 500 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'foo' });
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/HTTP 500/);
  });

  it('supports legacy single-file skill packages (skills/foo.md)', async () => {
    installFetch((url) => {
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://example.com/skills/foo.md' }] }));
      }
      if (url.endsWith('/skills/foo.md')) return res('# legacy body');
      return res('', { status: 404 });
    });
    const tool = setup();
    const out = await tool.handler({ name: 'foo' });
    expect(textOf(out)).toBe('# legacy body');
  });

  it('trims a trailing slash from siteOrigin so URLs do not double up', async () => {
    const seenUrls: string[] = [];
    installFetch((url) => {
      seenUrls.push(url);
      if (url.endsWith('/agents.json')) {
        return res(JSON.stringify({ skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }] }));
      }
      if (url === 'https://example.com/skills/foo/SKILL.md') return res('# ok');
      return res('', { status: 404 });
    });
    const tool = setup('https://example.com/');
    const out = await tool.handler({ name: 'foo' });
    expect(textOf(out)).toBe('# ok');
    expect(seenUrls.every((u) => !u.includes('//skills'))).toBe(true);
  });
});

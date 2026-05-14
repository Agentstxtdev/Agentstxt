import { describe, it, expect, afterEach, vi } from 'vitest';
import { registerGetSpec } from './get_spec.js';
import { captureTools, installFetch, res, textOf } from '../__tests__/helpers.js';

const SAMPLE = `# Title

## 1. Abstract
Abstract body.

## 2. Motivation
Motivation body.

## 3. File Format
Format body.

## 4. Discovery
Discovery body.

## 8. Payment Protocols
Payments body.

## 11. Authorization Protocols
Auth body.

## 15. Security Considerations
Security body.
`;

function setup(origin = 'https://example.com') {
  const { server, tools } = captureTools();
  registerGetSpec(server, origin);
  return tools.get_spec;
}

afterEach(() => vi.restoreAllMocks());

describe('get_spec', () => {
  it('returns full spec content for section="all"', async () => {
    installFetch(() => res(SAMPLE));
    const out = await setup().handler({ section: 'all' });
    expect(textOf(out)).toBe(SAMPLE);
    expect(out.isError).toBeUndefined();
  });

  it('returns an error result when the fetch fails (non-2xx)', async () => {
    installFetch(() => res('', { status: 502 }));
    const out = await setup().handler({ section: 'all' });
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/Failed to fetch spec/);
  });

  it('returns an error result when the network throws', async () => {
    installFetch(() => { throw new Error('eai_again'); });
    const out = await setup().handler({ section: 'all' });
    expect(out.isError).toBe(true);
  });

  it('filters by section: "overview" matches Abstract + Motivation', async () => {
    installFetch(() => res(SAMPLE));
    const out = await setup().handler({ section: 'overview' });
    const text = textOf(out);
    expect(text).toContain('Abstract body');
    expect(text).toContain('Motivation body');
    expect(text).not.toContain('Format body');
  });

  it('filters by section: "security" returns only the Security Considerations heading and body', async () => {
    installFetch(() => res(SAMPLE));
    const out = await setup().handler({ section: 'security' });
    const text = textOf(out);
    expect(text).toContain('Security body');
    expect(text).not.toContain('Abstract body');
  });

  it('falls back to full content when the section keyword is not found', async () => {
    installFetch(() => res('## Some Heading\nbody\n'));
    const out = await setup().handler({ section: 'payments' });
    expect(textOf(out)).toContain('Some Heading');
  });

  it('uses siteOrigin to construct the /llms-full.txt URL', async () => {
    const seenUrls: string[] = [];
    installFetch((url) => { seenUrls.push(url); return res(SAMPLE); });
    await setup('https://custom.example').handler({ section: 'all' });
    expect(seenUrls[0]).toBe('https://custom.example/llms-full.txt');
  });
});

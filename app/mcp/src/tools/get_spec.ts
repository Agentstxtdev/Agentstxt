import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const LLMS_FULL_PATH = '/llms-full.txt';

// Section headings in AGENTS-TXT-STANDARD.md mapped to keyword slugs for filtering
const SECTION_KEYWORDS: Record<string, string[]> = {
  overview:      ['Abstract', 'Motivation'],
  format:        ['File Format', 'Directives', 'Parsing Rules'],
  discovery:     ['Discovery'],
  payments:      ['Payment Protocols'],
  authorization: ['Authorization Protocols'],
  mcp:           ['MCP (Model Context Protocol)', '## 7.'],
  skills:        ['Skills (Agent Skills Protocol)'],
  json:          ['JSON Format'],
  examples:      ['Examples'],
  versioning:    ['Versioning', 'Extensibility'],
  security:      ['Security Considerations'],
};

const SECTIONS = ['overview', 'format', 'discovery', 'payments', 'authorization', 'mcp', 'skills', 'json', 'examples', 'versioning', 'security', 'all'] as const;
type Section = typeof SECTIONS[number];

async function fetchFullSpec(siteOrigin: string): Promise<string> {
  const url = `${siteOrigin}${LLMS_FULL_PATH}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to fetch spec: HTTP ${res.status}`);
  return res.text();
}

function filterBySection(content: string, section: Section): string {
  if (section === 'all') return content;

  const keywords = SECTION_KEYWORDS[section];
  if (!keywords) return content;

  const lines = content.split('\n');
  const result: string[] = [];
  let capturing = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isH2 = line.startsWith('## ');

    if (isH2) {
      const matchesSection = keywords.some((kw) => line.includes(kw));
      if (matchesSection) {
        capturing = true;
      } else if (capturing) {
        // Stop at the next H2 that doesn't match
        break;
      }
    }

    if (capturing) result.push(line);
  }

  return result.length > 0 ? result.join('\n').trim() : content;
}

export function registerGetSpec(server: McpServer, siteOrigin: string) {
  server.registerTool(
    'get_spec',
    {
      description:
        'Get the agents.txt standard spec (v1.0) from the live site. ' +
        'Use "all" for the full spec or a section name to filter: ' +
        'overview, format, discovery, payments, authorization, mcp, skills, json, examples, versioning, security.',
      inputSchema: {
        section: z
          .enum(SECTIONS)
          .default('all')
          .describe('Spec section to retrieve (default: all)'),
      },
    },
    async ({ section }: { section: Section }) => {
      let full: string;
      try {
        full = await fetchFullSpec(siteOrigin);
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to fetch spec: ${String(err)}` }],
          isError: true,
        };
      }

      const filtered = filterBySection(full, section);
      return { content: [{ type: 'text' as const, text: filtered }] };
    },
  );
}

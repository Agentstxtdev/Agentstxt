import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseAgentsTxt } from './parse_agents_txt.js';

const KNOWN_PROTOCOLS = new Set(['x402', 'mpp']);
const KNOWN_AUTH_PROTOCOLS = new Set(['agent-auth']);

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateParsed(parsed: ReturnType<typeof parseAgentsTxt>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (parsed.payments) {
    if (parsed.payments.enabled && parsed.payments.protocols.length === 0) {
      errors.push('Payments: enabled requires a Protocols: line with at least one protocol identifier');
    }
    for (const p of parsed.payments.protocols) {
      if (!KNOWN_PROTOCOLS.has(p)) {
        warnings.push(`Unknown payment protocol "${p}" — known values: x402, mpp`);
      }
    }
  }

  if (parsed.authorization) {
    for (const p of parsed.authorization.protocols) {
      if (!KNOWN_AUTH_PROTOCOLS.has(p)) {
        warnings.push(`Unknown authorization protocol "${p}" — known values: agent-auth`);
      }
    }
  }

  for (const url of parsed.mcp) {
    if (!isHttpsUrl(url)) {
      errors.push(`MCP URL must be a valid HTTPS URL — got: "${url}"`);
    }
  }

  for (const url of parsed.skills) {
    if (!isHttpsUrl(url)) {
      errors.push(`Skills URL must be a valid HTTPS URL — got: "${url}"`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAgentsJson(obj: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['agents.json must be a JSON object'], warnings };
  }

  const json = obj as Record<string, unknown>;

  if (!('version' in json)) warnings.push('Missing "version" field (expected "0.5")');
  if (!('standard' in json)) warnings.push('Missing "standard" field (expected "https://agentstxt.dev")');
  if (!('site' in json)) warnings.push('Missing "site" block with name and url');

  if ('payments' in json && json.payments) {
    const payments = json.payments as Record<string, unknown>;
    if (payments.enabled === true && !Array.isArray(payments.protocols)) {
      errors.push('"payments.protocols" must be an array when payments.enabled is true');
    }
  }

  if ('mcp' in json && json.mcp) {
    if (!Array.isArray(json.mcp)) {
      errors.push('"mcp" must be an array');
    } else {
      for (const entry of json.mcp as unknown[]) {
        if (typeof entry !== 'object' || entry === null || !('url' in (entry as object))) {
          errors.push('Each mcp entry must have a "url" field');
        } else {
          const e = entry as Record<string, unknown>;
          if (!isHttpsUrl(String(e.url))) {
            errors.push(`mcp[].url must be a valid HTTPS URL — got: "${e.url}"`);
          }
          if ('type' in e && e.type !== 'streamable-http') {
            warnings.push(`mcp[].type should be "streamable-http" — got: "${e.type}"`);
          }
        }
      }
    }
  }

  if ('skills' in json && json.skills) {
    if (!Array.isArray(json.skills)) {
      errors.push('"skills" must be an array');
    } else {
      for (const entry of json.skills as unknown[]) {
        if (typeof entry !== 'object' || entry === null || !('url' in (entry as object))) {
          errors.push('Each skills entry must have a "url" field');
        } else {
          const e = entry as Record<string, unknown>;
          if (!isHttpsUrl(String(e.url))) {
            errors.push(`skills[].url must be a valid HTTPS URL — got: "${e.url}"`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function registerValidateAgents(server: McpServer) {
  server.registerTool(
    'validate_agents_txt',
    {
      description:
        'Validate the text content of an agents.txt file against the spec rules. Returns errors (spec violations) and warnings (unknown identifiers).',
      inputSchema: {
        content: z.string().describe('Raw text content of an agents.txt file'),
      },
    },
    ({ content }: { content: string }) => {
      const parsed = parseAgentsTxt(content);
      const result = validateParsed(parsed);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'validate_agents_json',
    {
      description:
        'Validate an agents.json object against the spec schema. Returns errors (schema violations) and warnings.',
      inputSchema: {
        content: z.string().describe('Raw JSON string content of an agents.json file'),
      },
    },
    ({ content }: { content: string }) => {
      let obj: unknown;
      try {
        obj = JSON.parse(content);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, errors: ['Invalid JSON'], warnings: [] }, null, 2) }],
        };
      }
      const result = validateAgentsJson(obj);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}

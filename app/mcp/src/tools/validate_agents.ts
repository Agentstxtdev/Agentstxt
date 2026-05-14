import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseAgentsTxt } from './parse_agents_txt.js';
import {
  PAYMENT_PROTOCOLS,
  AUTH_PROTOCOLS,
  MPP_METHODS,
  isAcceptedPaymentIdentifier,
  isAcceptedAuthIdentifier,
} from '../protocols.js';

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /**
   * Positive observations — fields the validator recognised as present and
   * correctly shaped. Surfaces spec-compliant signals the operator should
   * keep, e.g. a `$schema` reference that earns the file editor autocomplete.
   * Always emitted (may be empty); consumers that ignore unknown fields are
   * unaffected.
   */
  notes: string[];
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
  const notes: string[] = [];

  if (parsed.payments) {
    if (parsed.payments.protocols.length === 0) {
      errors.push('Payments block requires a non-empty Protocols: line with at least one protocol identifier');
    }
    for (const p of parsed.payments.protocols) {
      if (!isAcceptedPaymentIdentifier(p)) {
        warnings.push(`Unknown payment protocol "${p}" — known values: ${PAYMENT_PROTOCOLS.join(', ')} (use \`x-\` prefix for experimental)`);
      }
    }
  }

  if (parsed.authorization) {
    for (const p of parsed.authorization.protocols) {
      if (!isAcceptedAuthIdentifier(p)) {
        warnings.push(`Unknown authorization protocol "${p}" — known values: ${AUTH_PROTOCOLS.join(', ')} (use \`x-\` prefix for experimental)`);
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

  for (const url of parsed.a2a) {
    if (!isHttpsUrl(url)) {
      errors.push(`A2A URL must be a valid HTTPS URL — got: "${url}"`);
    }
  }

  for (const url of parsed.ucp) {
    if (!isHttpsUrl(url)) {
      errors.push(`UCP URL must be a valid HTTPS URL — got: "${url}"`);
    }
  }

  for (const key of Object.keys(parsed.extensions)) {
    warnings.push(`Unknown directive "${key}:" — ignored. Use \`x-\` prefix for experimental identifiers; new block-level directives require a spec update.`);
  }

  return { valid: errors.length === 0, errors, warnings, notes };
}

function validateAgentsJson(obj: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['agents.json must be a JSON object'], warnings, notes };
  }

  const json = obj as Record<string, unknown>;

  // `$schema` is optional but recommended: a URL pointing at the JSON Schema
  // for agents.json earns the file inline validation + autocomplete in any
  // JSON-aware editor. Surface a positive signal when present; nudge once
  // when absent so operators learn about the integration.
  if (typeof json.$schema === 'string') {
    notes.push(`Schema reference present: ${json.$schema}`);
  } else if ('$schema' in json) {
    warnings.push('"$schema" present but not a string — should be the URL of the JSON Schema describing this document');
  } else {
    warnings.push('No "$schema" field — adding one (e.g. "https://agentstxt.dev/schema/agents-json/v1.0.json") gives editors autocomplete and inline validation');
  }
  if (!('version' in json)) warnings.push('Missing "version" field (expected "0.5")');
  if (!('standard' in json)) warnings.push('Missing "standard" field (expected "https://agentstxt.dev")');
  if (!('site' in json)) warnings.push('Missing "site" block with name and url');

  if ('payments' in json && json.payments) {
    const payments = json.payments as Record<string, unknown>;
    const protocolKeys = Object.keys(payments).filter(
      (k) => (PAYMENT_PROTOCOLS as readonly string[]).includes(k) || k.startsWith('x-'),
    );
    if (protocolKeys.length === 0) {
      errors.push(`"payments" must include at least one per-protocol object (${PAYMENT_PROTOCOLS.join(' or ')}, or an x- prefixed experimental key) when present`);
    }
    if ('required' in payments && typeof payments.required !== 'boolean') {
      errors.push('"payments.required" must be a boolean when present');
    }
    const mpp = payments.mpp as Record<string, unknown> | undefined;
    if (mpp && 'methods' in mpp) {
      const methods = mpp.methods;
      if (!Array.isArray(methods) || methods.length === 0) {
        errors.push('"payments.mpp.methods" must be a non-empty array when present');
      } else {
        const recognised = new Set<string>(MPP_METHODS);
        for (const m of methods as unknown[]) {
          if (typeof m !== 'string' || !recognised.has(m)) {
            warnings.push(`Unrecognised MPP method "${String(m)}" (recognised: ${MPP_METHODS.join(', ')})`);
          }
        }
      }
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

  if ('a2a' in json && json.a2a) {
    if (!Array.isArray(json.a2a)) {
      errors.push('"a2a" must be an array');
    } else {
      for (const entry of json.a2a as unknown[]) {
        if (typeof entry !== 'object' || entry === null || !('url' in (entry as object))) {
          errors.push('Each a2a entry must have a "url" field');
        } else {
          const e = entry as Record<string, unknown>;
          if (!isHttpsUrl(String(e.url))) {
            errors.push(`a2a[].url must be a valid HTTPS URL — got: "${e.url}"`);
          }
        }
      }
    }
  }

  if ('ucp' in json && json.ucp) {
    if (!Array.isArray(json.ucp)) {
      errors.push('"ucp" must be an array');
    } else {
      for (const entry of json.ucp as unknown[]) {
        if (typeof entry !== 'object' || entry === null || !('url' in (entry as object))) {
          errors.push('Each ucp entry must have a "url" field');
        } else {
          const e = entry as Record<string, unknown>;
          if (!isHttpsUrl(String(e.url))) {
            errors.push(`ucp[].url must be a valid HTTPS URL — got: "${e.url}"`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, notes };
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
          content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, errors: ['Invalid JSON'], warnings: [], notes: [] }, null, 2) }],
        };
      }
      const result = validateAgentsJson(obj);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}

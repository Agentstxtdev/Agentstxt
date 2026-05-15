import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Hono } from 'hono';
import { registerGetSpec } from './tools/get_spec.js';
import { registerGetSkill } from './tools/get_skill.js';
import { registerParseAgentsTxt } from './tools/parse_agents_txt.js';
import { registerValidateAgents } from './tools/validate_agents.js';
import { registerAuditSite } from './tools/audit_site.js';

export type Env = {
  SITE_ORIGIN: string;
  // Optional service binding back to the site worker. audit_site uses it to
  // route fetches whose target origin matches SITE_ORIGIN, bypassing the
  // Cloudflare same-account-subrequest loop that returns 522. Optional so
  // wrangler dev without the binding still boots; safeFetch falls back to
  // plain fetch() in that case.
  SITE?: { fetch: typeof fetch };
};

type State = Record<string, never>;
type Props = Record<string, never>;

export class AgentsTxtMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({
    name: 'agents.txt',
    version: '0.5.0',
    websiteUrl: 'https://agents-txt.com',
  });

  initialState: State = {};

  async init() {
    registerGetSpec(this.server, this.env.SITE_ORIGIN);
    registerGetSkill(this.server, this.env.SITE_ORIGIN);
    registerParseAgentsTxt(this.server);
    registerValidateAgents(this.server);
    registerAuditSite(this.server, this.env);
  }
}

const app = new Hono<{ Bindings: Env }>();

app.all('/mcp', (c) =>
  AgentsTxtMCP.serve('/mcp', { binding: 'AgentsTxtMCP' }).fetch(c.req.raw, c.env, c.executionCtx),
);

app.all('/sse', (c) =>
  AgentsTxtMCP.serveSSE('/sse', { binding: 'AgentsTxtMCP' }).fetch(c.req.raw, c.env, c.executionCtx),
);

app.all('/sse/*', (c) =>
  AgentsTxtMCP.serveSSE('/sse', { binding: 'AgentsTxtMCP' }).fetch(c.req.raw, c.env, c.executionCtx),
);

export default app;

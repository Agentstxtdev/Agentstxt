import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Hono } from 'hono';
import { registerGetSpec } from './tools/get_spec.js';
import { registerGetSkill } from './tools/get_skill.js';
import { registerParseAgentsTxt } from './tools/parse_agents_txt.js';
import { registerValidateAgents } from './tools/validate_agents.js';
import { registerAuditSite } from './tools/audit_site.js';

export type Env = { SITE_ORIGIN: string };

type State = Record<string, never>;
type Props = Record<string, never>;

export class AgentsTxtMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({
    name: 'agents.txt',
    version: '0.5.0',
    websiteUrl: 'https://agentstxt.dev',
  });

  initialState: State = {};

  async init() {
    registerGetSpec(this.server, this.env.SITE_ORIGIN);
    registerGetSkill(this.server, this.env.SITE_ORIGIN);
    registerParseAgentsTxt(this.server);
    registerValidateAgents(this.server);
    registerAuditSite(this.server);
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

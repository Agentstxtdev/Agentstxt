import mcpHandler, { type Env } from './server.js';
import { runAudit } from './tools/audit_site.js';

export { AgentsTxtMCP } from './server.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/**
 * Plain-HTTP companion to the `audit_site` MCP tool. Returns the same audit
 * report shape (no MCP JSON-RPC envelope) so consumers that do not speak the
 * MCP protocol — the site worker's `/audit` route, third-party scripts,
 * curl-from-CI — can use it without implementing the protocol's session +
 * initialize handshake. MCP clients should continue calling the tool over
 * the `/mcp` transport for capability discovery; this endpoint exists for
 * the long tail of non-MCP HTTP callers.
 */
async function handleApiAudit(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return Response.json(
      { error: 'missing_url', message: 'Provide ?url=<target>' },
      { status: 400, headers: CORS },
    );
  }
  // Pass env so safeFetch can route self-targeted fetches through the SITE
  // service binding instead of public fetch(), avoiding the same-account
  // subrequest loop that returns 522 when site → MCP → public agents-txt.com.
  const report = await runAudit(target, env);
  const status = report._error === true ? 400 : 200;
  if (report._error === true) delete report._error;
  return Response.json(report, { status, headers: CORS });
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/' || path === '/health') {
      return Promise.resolve(Response.json({
        ok: true,
        service: 'agents-txt-mcp',
        version: '0.5.0',
        endpoints: { mcp: '/mcp', sse: '/sse', audit: '/api/audit?url=<target>' },
      }));
    }

    if (path === '/api/audit') {
      return handleApiAudit(request, env);
    }

    return Promise.resolve(mcpHandler.fetch(request, env, ctx));
  },
};

# `adopt-agents-txt`: Reference

Full directive list, `agents.json` schema, capability block examples, and hand-write templates per framework. Open this from SKILL.md when the user asks about a specific directive's syntax, an `agents.json` field, or the canonical layout for a capability block.

Canonical spec: [`spec/AGENTS-TXT-STANDARD.md`](https://agentstxt.dev/spec). When in doubt, the spec wins.

---

## `agents.txt` directives

Plain UTF-8 text. One directive per line. Lines starting with `#` are comments. Blank lines are ignored. The file MUST end with a newline.

| Directive | Cardinality | Example | Meaning |
|---|---|---|---|
| `Site-Name:` | 1 (required) | `Site-Name: My Site` | Human-readable site name |
| `Site-URL:` | 1 (required) | `Site-URL: https://mysite.com` | Canonical URL |
| `Site-Description:` | 0–1 | `Site-Description: A blog about distributed systems.` | One-sentence purpose |
| `Protocols:` | 0–1 | `Protocols: x402, mpp` | Comma-separated list of supported payment protocols. Opens the payments block. |
| `Payments:` | 0–1 | `Payments: required` | Optional site-level policy hint. When present with value `required`, every interaction requires payment. |
| `Authorization:` | 0–1 | `Authorization: agent-auth` | Authentication protocol identifier. Opens the authorization block. |
| `Identity:` | 0–1 | `Identity: required` | When agents must authenticate before any interaction |
| `MCP:` | 0–N | `MCP: https://mysite.com/mcp` | URL of an MCP server (Streamable HTTP transport) |
| `Skills:` | 0–N | `Skills: https://mysite.com/skills/main/SKILL.md` | URL of a `SKILL.md` file or skill index. Path is site-specific. |
| `A2A:` | 0–N | `A2A: https://mysite.com/.well-known/agent-card.json` | URL of an A2A AgentCard JSON document (a2a-protocol.org). Opens the A2A block (spec §9). |

**Order:** Site-* directives first, capability blocks after. Within a block, the block-opener directive first (e.g., `Protocols:` for payments, `Authorization:` for auth) followed by any policy hints (`Payments: required`, `Identity: required`).

**Casing:** Directive names are case-insensitive on parse but SHOULD be written as `Title-Case:` for human readability.

---

## Minimal valid file

```
# /agents.txt
# Spec: https://agentstxt.dev

Site-Name: My Site
Site-URL: https://mysite.com
```

This is conformant. The site exists, has a name, declares no capabilities. Most non-monetized read-only sites stop here.

---

## Capability blocks

### Payments

```
Site-Name: My Site
Site-URL: https://mysite.com

Protocols: x402, mpp
```

The `Protocols:` directive opens the payments block and declares which payment protocols the site accepts. Order of values is hint-only. The optional `Payments: required` directive on the next line signals site-level policy: every interaction requires payment, no free path. `agents.json` carries the structured details (`payments.x402.chains`, `payments.mpp.methods`, `payments.pricing`). Implementation is on the site's `402` response bodies; `agents.txt` never carries wallet addresses or amounts.

Supported values:

- `x402`: HTTP-native crypto micropayments (per-request, EIP-3009 / SVM). Spec: [x402.org](https://x402.org).
- `mpp`: Machine Payments Protocol (session-based, fiat + USDC via Stripe SPT or Tempo). IETF draft: `draft-ryan-httpauth-payment`.

**Experimental identifiers (`x-` prefix).** Per spec §3.1, protocols not yet registered in the spec MAY be advertised using the `x-` prefix (e.g. `Protocols: x402, x-mypay`). Parsers MUST accept these; validators MUST NOT warn. The convention extends to `agents.json` per-protocol object keys (`payments["x-mypay"]: {}`). Use this for protocols still being designed in the wild. Once registered formally, the `x-` form is retired in favour of the registered name.

### Authorization

```
Authorization: agent-auth
Identity: required
```

`Authorization:` declares the agent-identification protocol. Currently spec-recognized: `agent-auth`. Discovery endpoint is hardcoded at `/.well-known/agent-configuration` per the agent-auth protocol. Experimental identifiers via the `x-` prefix (e.g. `x-myauth`) are accepted per spec §3.1.

`Identity: required` is a site-level policy; if present, agents MUST authenticate before any interaction (not just before capability execution). Useful for sites that gate all reads on agent identity.

### MCP

```
MCP: https://mysite.com/mcp
MCP: https://mysite.com/admin/mcp
```

URL(s) of MCP server(s). Transport is always Streamable HTTP per current MCP spec. Agents call these URLs with the `MCP-Session-Id` handshake. Sites that publish multiple MCP endpoints (e.g., one for public tools, one for admin) emit multiple `MCP:` lines.

### Skills

```
Skills: https://mysite.com/skills/main/SKILL.md
```

URL of the `SKILL.md` file at the root of an [agentskills.io](https://agentskills.io)-conformant skill folder. The canonical layout is `<base>/<skill-name>/SKILL.md` with optional sibling `REFERENCE.md` and any supporting scripts or assets in the same folder. `agents.txt` advertises only the `SKILL.md` URL (one `Skills:` line per skill); companion files are discovered by the skill's own internal links once the agent has fetched `SKILL.md`. `agents.json` references the same URL under `skills[].url`. `agents.txt` governs only the discovery directive, not the path or internal layout; the path is fully site-specific.

### A2A

```
A2A: https://mysite.com/.well-known/agent-card.json
A2A: https://mysite.com/agents/support/card.json
```

One `A2A:` line per [A2A](https://a2a-protocol.org) AgentCard URL. Each URL points to a JSON document describing one agent's identity, capabilities, supported extensions (including the [x402 payments extension](https://github.com/google-agentic-commerce/a2a-x402) where applicable), transport, and security schemes.

**When to declare an A2A block.** The canonical well-known path `/.well-known/agent-card.json` already lets A2A clients discover a single AgentCard without help from `agents.txt`. Declare the block only when:

- the site runs more than one A2A agent on the same origin (multi-agent sites), or
- the AgentCard is served at a non-canonical path (e.g. `/agents/sales/card.json`), or
- the site wants to surface a description on each card in `agents.json` (the description field is `agents.json`-only).

`agents.txt` carries only the URL. All agent metadata (skills, capabilities, supported extensions, security schemes, transport) stays in the AgentCard itself, exactly as the A2A specification defines. Per spec §9, the `A2A:` block is independent of the Payments and Authorization blocks; per-agent payment configuration lives in each AgentCard's `capabilities.extensions`, not in `agents.txt`.

`agents.json` mirrors the directive as an `a2a[]` array of `{ url, description? }` entries, symmetric with `mcp[]` and `skills[]`.

---

## `agents.json` schema

Same information as `agents.txt`, in machine-friendly JSON. Sites SHOULD serve both: `agents.txt` for plain-text discovery, `agents.json` for structured pre-screening.

```json
{
  "version": "1.0",
  "site": {
    "name": "My Site",
    "url": "https://mysite.com",
    "description": "A blog about distributed systems."
  },
  "payments": {
    "x402": {
      "chains": ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      "description": "Per-request micropayments for premium API endpoints."
    },
    "mpp": {
      "methods": ["tempo", "stripe"],
      "description": "Session-based payments via Stripe (fiat + Solana USDC) and Tempo (USDC.e)."
    },
    "pricing": { "amount": "0.001", "currency": "USDC" }
  },
  "authorization": {
    "protocols": ["agent-auth"],
    "discovery": "/.well-known/agent-configuration",
    "identityRequired": false
  },
  "mcp": [
    { "url": "https://mysite.com/mcp", "type": "streamable-http", "description": "Public tools." }
  ],
  "skills": [
    { "url": "https://mysite.com/skills/main/SKILL.md", "description": "Public skill package." }
  ],
  "a2a": [
    { "url": "https://mysite.com/.well-known/agent-card.json", "description": "Primary support agent." }
  ]
}
```

### Field rules

| Field | Required | Notes |
|---|---|---|
| `version` | yes | Always `"1.0"` for v1.0 compliance |
| `site.name`, `site.url` | yes | Mirror the `Site-Name` / `Site-URL` directives |
| `site.description` | no | Plain text, ≤ 200 chars |
| `payments.x402` (object) | when x402 declared | Presence of this key is the x402 support signal. Carries `chains` and any future x402-specific fields. |
| `payments.mpp` (object) | when MPP declared | Presence of this key is the MPP support signal. Carries `methods` and any future MPP-specific fields. |
| `payments.x402.chains` | when x402 declared | CAIP-2 network IDs. Lets agents pre-check chain support before paying. |
| `payments.mpp.methods` | when MPP declared | Array of configured method identifiers; recognised values: `"tempo"`, `"stripe"`. Lists only methods whose credentials are wired up. |
| `payments.x402.description`, `payments.mpp.description` | optional | Short human-readable string describing what the agent is paying for under each protocol (the product, service, or resource the site sells). One sentence. Appears in `agents.json` only, never in `agents.txt`. |
| `payments.pricing` | recommended | `{ amount: string (decimal), currency: string }`. Major-unit decimal. Wallet addresses NEVER appear here. |
| `payments.required` | optional | Boolean. When `true`, site-level policy: every interaction requires payment, no free path. Symmetric with `Identity: required`. |
| `authorization.protocols` | when auth declared | Default `["agent-auth"]` |
| `authorization.discovery` | when auth declared | Always `/.well-known/agent-configuration` for `agent-auth` |
| `authorization.identityRequired` | optional | Mirrors `Identity:` directive |
| `mcp[]` | when MCP declared | Array of `{ url, type, description? }`. `type` is always `"streamable-http"` for HTTP MCP. |
| `skills[]` | when skills declared | Array of `{ url, description? }`. URL points to a `SKILL.md` file or skill index (agentskills.io). Path is site-specific. |
| `a2a[]` | when A2A declared | Array of `{ url, description? }`. URL points to an A2A AgentCard JSON document (a2a-protocol.org). Description is optional and `agents.json`-only. |

### Security invariants for `agents.json`

These fields MUST NEVER appear:

- Wallet addresses (`evmAddress`, `solanaAddress`, `tempoRecipient`, etc.)
- Stripe secret keys, MPP HMAC keys
- API keys, JWKs, session tokens
- Internal URLs that aren't meant to be discovered

They live in `402` response bodies, server env, or protected admin surfaces.

---

## Hand-write templates

### Static site (Astro / Next.js / Vite / Hugo / Jekyll)

Save the file under whatever directory the framework serves as `/`:

```
public/
├── agents.txt          ← copy from minimal valid file above
├── agents.json         ← copy from schema example above
├── robots.txt          (optional, if not generated)
├── llms.txt            (optional)
└── sitemap.xml         (optional)
```

Build artefacts are passthrough: Astro/Next/Vite copy `public/` verbatim, Hugo/Jekyll copy `static/`. No code changes required.

### Express

```ts
import express from 'express'

const app = express()
const SITE = { name: 'My Site', url: 'https://mysite.com', description: '…' }

app.get('/agents.txt', (_, res) => {
  res.type('text/plain').send(
    `# /agents.txt\n` +
    `# Spec: https://agentstxt.dev\n\n` +
    `Site-Name: ${SITE.name}\n` +
    `Site-URL: ${SITE.url}\n`
  )
})

app.get('/agents.json', (_, res) => {
  res.json({
    version: '1.0',
    site: SITE,
  })
})

app.listen(3000)
```

### Hono

```ts
import { Hono } from 'hono'

const app = new Hono()
const SITE = { name: 'My Site', url: 'https://mysite.com' }

app.get('/agents.txt', (c) =>
  c.text(`Site-Name: ${SITE.name}\nSite-URL: ${SITE.url}\n`),
)

app.get('/agents.json', (c) =>
  c.json({ version: '1.0', site: SITE }),
)

export default app
```

### Next.js App Router

`app/agents.txt/route.ts`:

```ts
const SITE = { name: 'My Site', url: 'https://mysite.com' }

export function GET() {
  return new Response(
    `Site-Name: ${SITE.name}\nSite-URL: ${SITE.url}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
```

`app/agents.json/route.ts`:

```ts
const SITE = { name: 'My Site', url: 'https://mysite.com' }

export function GET() {
  return Response.json({ version: '1.0', site: SITE })
}
```

### Cloudflare Worker

```ts
const SITE = { name: 'My Site', url: 'https://mysite.com' }

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/agents.txt') {
      return new Response(
        `Site-Name: ${SITE.name}\nSite-URL: ${SITE.url}\n`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )
    }
    if (url.pathname === '/agents.json') {
      return Response.json({ version: '1.0', site: SITE })
    }
    return new Response('Not Found', { status: 404 })
  },
}
```

---

## §4.5 Serving requirements (mandatory response headers)

Both files MUST be served with:

| Header | `agents.txt` value | `agents.json` value |
|---|---|---|
| `Content-Type` | `text/plain; charset=utf-8` | `application/json` |
| `Access-Control-Allow-Origin` | `*` | `*` |
| `Cache-Control` (SHOULD) | `public, max-age=3600` | `public, max-age=3600` |

The CORS header is the one most often missed. It exists because browser-context agents (extensions, web playgrounds, in-app copilots) cannot fetch a cross-origin `agents.txt` / `agents.json` without it; the file silently becomes unreadable. The charset half of `Content-Type` exists because §3 mandates UTF-8 and browsers fall back to ISO-8859-1 without it.

**Static vs dynamic well-known paths.** §4.5 governs `/agents.txt` and `/agents.json` only, but other discovery surfaces (`/.well-known/agent-card.json` for A2A, `/.well-known/agent-configuration` for agent-auth, future well-known paths) need the same headers to work cross-origin. The right place to set them depends on how the path is served, not on what it contains:

- **Static file** (a real file under your `public/` directory, including `public/.well-known/*.json`): add a block to your `_headers` (or `vercel.json#headers`) mirroring the `/agents.json` shape. The hosting platform's static asset pipeline applies them. Without an entry the file responds 200, but no CORS header is set and any browser-context client on a different origin gets a CORS error.
- **Dynamic route** (served by a route handler, middleware, or worker): the handler sets the headers in code. `_headers` and similar declarative configs do not apply to dynamic routes; if you put an entry there, it has no effect. Inside an Express, Next.js, Hono, or Cloudflare worker handler, set `Access-Control-Allow-Origin: *`, the right `Content-Type`, and a `Cache-Control` before responding.

Quick test for which one you have: if you can `ls` the file in your output directory after `npm run build`, it's static. If the file does not exist on disk but the URL still responds, it's dynamic.

**Dev-server caveat.** Production hosts apply `_headers` / `vercel.json#headers` at the edge, but most dev servers do not: Vite-based stacks (Astro, SvelteKit, Remix, Nuxt 3, plain Vite) ignore `public/_headers`; `vercel dev` does not honor `vercel.json#headers` for every request; Express and Hono dev servers do nothing on their own. The visible symptom is that `audit_site http://localhost:…` reports §4.5 fails which the same site does not exhibit in production. The CORS half is the practical breakage: browser-context clients fail cross-origin fetches on `localhost`.

Three ways to close the dev/prod gap. Pick whichever fits your stack:

1. **Audit the production URL, not localhost.** Cleanest if you trust your deploy pipeline. The spec governs the public deployment; local dev is implementation detail.
2. **Hand-roll a small middleware** that reads your `_headers` / `vercel.json` and applies the matching headers. ~30 lines of code: parse the file once, match `req.url` against each block, call `res.setHeader` for the matched rules, fall through to the next middleware.
3. **Use an adoption tool's dev shim.** If you already use `herald` (or a similar generator) to emit your headers file, check whether it ships a dev-server shim. `@herald/addon/dev` exports a Vite plugin (`heraldHeadersVitePlugin`), a Connect/Express middleware (`heraldHeadersConnect`), and a Hono middleware (`heraldHeadersHono`) that do exactly the read-and-replay step. Next.js sites use the native `next.config.js` `async headers()` API (works in both dev and prod) and need no extra shim. None of this is required by the spec — it is convenience.

### Per-platform configuration

| Platform | Mechanism | Generated by `herald generate --headers`? |
|---|---|---|
| Cloudflare Workers / Pages | `_headers` file at the assets root | ✅ |
| Netlify | `_headers` file at the publish root (same syntax) | ✅ |
| Vercel | `vercel.json#headers[]` at the project root | ✅ (with merge semantics) |
| Nginx | `add_header` inside the matching `location` block | ❌ (server config, manual) |
| Apache | `Header set` in `.htaccess` or vhost | ❌ (server config, manual) |
| Caddy | `header` directive in Caddyfile | ❌ (server config, manual) |
| AWS S3 + CloudFront | Response Headers Policy | ❌ (cloud console / IaC, manual) |
| Express / Hono / Next.js handlers | Set in the route handler | n/a — `@herald/addon` middleware does this |

Adopters using `herald` on a supported platform get the file emitted automatically (default mode of `herald generate`, or `herald generate --headers` to emit only the headers config). Other platforms require manual configuration with the values above.

### Cloudflare / Netlify `_headers` template

```
/agents.txt
  Content-Type: text/plain; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600

/agents.json
  Content-Type: application/json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
```

### Vercel `vercel.json` template

```json
{
  "headers": [
    {
      "source": "/agents.txt",
      "headers": [
        { "key": "Content-Type", "value": "text/plain; charset=utf-8" },
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=3600" }
      ]
    },
    {
      "source": "/agents.json",
      "headers": [
        { "key": "Content-Type", "value": "application/json" },
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=3600" }
      ]
    }
  ]
}
```

### Nginx template

```nginx
location = /agents.txt {
  add_header Content-Type "text/plain; charset=utf-8" always;
  add_header Access-Control-Allow-Origin "*" always;
  add_header Cache-Control "public, max-age=3600" always;
}

location = /agents.json {
  add_header Content-Type "application/json" always;
  add_header Access-Control-Allow-Origin "*" always;
  add_header Cache-Control "public, max-age=3600" always;
}
```

After wiring, run `audit_site` (below) to verify.

---

## Validating the result

### Via the public MCP server

The reference MCP server at `mcp.agentstxt.dev` exposes:

| Tool | Input | What it returns |
|---|---|---|
| `validate_agents_txt` | `{ content: string }` | Compliance report against the v1.0 spec |
| `validate_agents_json` | `{ content: string }` | JSON schema check |
| `audit_site` | `{ url: string }` | End-to-end live audit: §4.5 serving headers, §3, §6–§11 directive validation, §5 schema validation, §5.4 / §14 secret-leak scan, and `agents.txt` vs `agents.json` cross-file consistency. Returns a `summary` block with `compliant: boolean` for one-line pass/fail. |
| `parse_agents_txt` | `{ content: string }` | Returns the parsed directive map |
| `get_spec` | `{ section?: string }` | Returns the spec text or a specific section |

Any MCP-aware client (Claude Desktop, mcp-inspector, etc.) can call these.

### Manual

```bash
# agents.txt — should be 200 OK, text/plain, UTF-8
curl -i https://example.com/agents.txt

# agents.json — must parse, must include version and site
curl https://example.com/agents.json | jq '.version, .site.name, .site.url'
```

If both files are present, confirm they declare the same capabilities. Mismatches confuse agents.

---

## Common questions to answer in-line

- **"Do I need both `agents.txt` and `agents.json`?"** Strictly, just `agents.txt`. The companion is recommended for any site with capability blocks because it lets agents pre-screen without parsing plain text. For a minimal site declaring only `Site-Name`/`Site-URL`, `agents.txt` alone is fine.
- **"Can I add custom directives?"** The spec is extensible: new capability blocks can be added without breaking parsers. For unregistered *protocol identifiers* inside an existing block (`Protocols:`, `Authorization:`), use the `x-` prefix per §3.1 (`x-mypay`, `x-myauth`). Parsers accept them; validators do not warn. For a wholly new *directive* (a new block opener like `A2A:` was in v1.0), open an RFC PR against the spec instead; experimental directive names are not covered by the `x-` convention.
- **"Do I need an `A2A:` block?"** No, unless you run multiple A2A agents on one origin or serve an AgentCard at a non-canonical path. A2A clients can probe the canonical well-known path (`/.well-known/agent-card.json`) directly. The `A2A:` block exists to cover the cases the canonical path does not.
- **"Where do wallet addresses go?"** Never in discovery files. They appear in `402` response bodies via the protocol's own conventions (e.g. `accepts[].payTo` for x402 v2). Discovery files only signal *which protocols* are supported, not the wire details.
- **"What if my site doesn't accept payments?"** Drop the `Protocols:` line (and optional `Payments: required`) from `agents.txt` and omit the `payments` block from `agents.json`. A site declaring no monetization is fully conformant.
- **"How do I update the file when I change a capability?"** Re-deploy. Cache headers should be ≤ 1 hour for `agents.*` files since they're discovery surfaces; agents will pick up changes within that window.

---

## When this skill ends

Hand off to:

- **Spec maintainers** for structural questions about the standard itself.
- **Per-framework documentation** (Astro / Next.js / Hono / Express / Cloudflare Workers / Hugo / Jekyll) for their static-asset serving conventions.
- **herald's own setup skill** when the user picks the generator path and wants the CLI walkthrough.
- **MCP / agent-auth / x402 / mppx documentation** for protocol-implementation depth; this skill stops at "declare the capability". Wiring the actual `402` handler or MCP server is the next conversation.

---

## Complementary ecosystem discovery surfaces (optional, not part of `agents.txt` v1.0)

`agents.txt` is the canonical capability-declaration surface. The wider agent-readiness ecosystem has converged on several additional well-known files that scanners and registry tools probe in parallel. None of them are mandated by `agents.txt` v1.0, and adopting any one of them is independent of adopting the others. Each one has its own working group, its own schema, and its own audit tooling. The spec covers the relationship between each of these and the `agents.txt` directives in §12.

| Path | Standard | What it adds beyond `agents.txt` |
|---|---|---|
| `/.well-known/api-catalog` | RFC 9727 (`application/linkset+json`) | API discovery for non-agent consumers: lists every API with `service-desc` (OpenAPI / AsyncAPI / GraphQL spec) and `service-doc` (human docs) link relations. Useful when the site has APIs beyond MCP / A2A / UCP. |
| `/.well-known/mcp/server-card.json` | SEP-2127 (MCP working group, draft) | MCP-native pre-screening: `serverInfo` + `transport` + capability flags (`tools`, `resources`, `prompts`). Agents read it to decide whether to open a session, without negotiating. |
| `/.well-known/agent-skills/index.json` | agentskills.io Discovery v0.2.0 | Per-skill verification: each entry carries a `sha256:<hex>` digest plus `type` (`skill-md` or `archive`). Useful when skill artifact integrity matters or when sites publish skill bundles alongside SKILL.md files. |
| `/openapi.json` | OpenAPI 3.1 + `x-payment-info` (paymentauth.org Payment Discovery draft) | Per-path payable-operation declaration: `x-payment-info` on each operation carries `intent`, `method`, `amount`, `currency`, `description`. Lets agents pre-screen the cost of a specific path before issuing the request. |
| `/.well-known/oauth-protected-resource` | RFC 9728 | OAuth-specific binding: declares which authorization servers can issue tokens for this resource. Required only when the site speaks OAuth. `agents.txt`'s `Authorization:` directive carries the protocol family identifier; this file declares the OAuth-specific details. |
| `Link:` response headers on `/` | RFC 8288 | HTTP-layer discovery: each `Link: <path>; rel="…"` lets an agent reach a discovery file in one round trip without parsing `agents.txt` first. Use `rel="api-catalog"` for the catalog, `rel="describedby"` for site descriptors, `rel="service-desc"` for machine specs. |

How to advertise these consistently with `agents.txt`:

1. Every URL declared in `agents.txt` (`MCP:`, `Skills:`, `A2A:`, `UCP:`) SHOULD appear as an entry or anchor in the corresponding ecosystem file when both are published. The cross-file consistency check is the same shape as the `agents.txt` / `agents.json` cross-check the MCP `audit_site` tool already performs.
2. Per-path `x-payment-info` in `/openapi.json` and the per-protocol blocks in `agents.json` are complementary, not redundant. `agents.json` answers "what payment protocols does the site speak"; `x-payment-info` answers "what does *this specific path* cost". Both can coexist.
3. The `_headers` rules for static files (Content-Type, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`) are the same shape spec §4.5 mandates for `/agents.txt` / `/agents.json`. Mirror that pattern for any new well-known JSON / linkset+json file you publish.

If the user is using a generator (herald or another), all of these can be emitted from the same single config object that drives `agents.txt`. If the user is hand-writing files, each one is a single small JSON document; the schemas are simple. Either way, none of them are prerequisites for adopting `agents.txt`. Adopt them as audit needs dictate.

# `adopt-agents-txt`: Reference

Full directive list, `agents.json` schema, capability block examples, and hand-write templates per framework. Open this from SKILL.md when the user asks about a specific directive's syntax, an `agents.json` field, or the canonical layout for a capability block.

Canonical spec: [`spec/AGENTS-TXT-STANDARD.md`](https://agents-txt.com/spec). When in doubt, the spec wins.

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

**Order:** Site-* directives first, capability blocks after. Within a block, the block-opener directive first (e.g., `Protocols:` for payments, `Authorization:` for auth) followed by any policy hints (`Payments: required`, `Identity: required`).

**Casing:** Directive names are case-insensitive on parse but SHOULD be written as `Title-Case:` for human readability.

---

## Minimal valid file

```
# /agents.txt
# Spec: https://agents-txt.com

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

Future values can be added without spec bump as long as they're identifier strings.

### Authorization

```
Authorization: agent-auth
Identity: required
```

`Authorization:` declares the agent-identification protocol. Currently spec-recognized: `agent-auth`. Discovery endpoint is hardcoded at `/.well-known/agent-configuration` per the agent-auth protocol.

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
    `# Spec: https://agents-txt.com\n\n` +
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

The reference MCP server at `mcp.agents-txt.com` exposes:

| Tool | Input | What it returns |
|---|---|---|
| `validate_agents_txt` | `{ content: string }` | Compliance report against the v1.0 spec |
| `validate_agents_json` | `{ content: string }` | JSON schema check |
| `audit_site` | `{ url: string }` | End-to-end live audit: §4.5 serving headers, §3, §6–§11 directive validation, §5 schema validation, §5.4 / §14 secret-leak scan, and `agents.txt ↔ agents.json` cross-file consistency. Returns a `summary` block with `compliant: boolean` for one-line pass/fail. |
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
- **"Can I add custom directives?"** The spec is extensible (new capability blocks can be added without breaking parsers). Custom directives outside the spec must use `X-` prefix to signal non-standard. Better: open an RFC against the spec.
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

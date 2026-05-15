---
name: adopt-agents-txt
description: Guides a developer through adopting the agents.txt standard on their own website. Use when the user wants their site to be agent-readable, wants to add an agents.txt or agents.json file, wants to advertise capabilities (Payments / Authorization / MCP / Skills) to AI agents, or asks "how do I make my site work with agentic clients". Walks them through the spec, picks the right adoption path (hand-write / generator / library), and validates the result.
---

# Adopt agents.txt

You are helping a developer make their existing website **agent-readable** by serving the four discovery files of the agent-readiness stack, most importantly the new Layer 4 file `/agents.txt` (with companion `/agents.json`).

This skill is **not** for working on the agents.txt spec itself, and it is **not** for setup tasks inside the spec's reference repository. It is for *external* sites that want to adopt the standard.

---

## Diagnose first

Before recommending anything, determine four things (infer from context, ask only if you can't):

1. **What's their hosting model?**
   - **Static site** (Astro, Hugo, Jekyll, Next.js export, Vite): files served from a `public/` or `static/` folder
   - **Server framework** (Express, Next.js App Router, Hono, Fastify): can run middleware, can dynamically respond to requests
   - **CDN or edge runtime** (Cloudflare Workers, Vercel Edge, Deno Deploy): treat like server but constrain to fetch-style APIs

2. **Which capability blocks do they want to declare?**
   - **Payments** (x402 crypto / MPP fiat+crypto): only if the site monetizes agent traffic
   - **Authorization** (`agent-auth`): only if agents need to identify themselves
   - **MCP** server: only if the site exposes an MCP endpoint
   - **Skills**: only if the site publishes installable skill packages
   - **A2A** AgentCards: only if the site runs A2A agents at non-canonical paths or runs multiple A2A agents on one origin. Single-agent sites at the canonical well-known path (`/.well-known/agent-card.json`) do not need an `A2A:` block; A2A clients can probe the well-known path directly.
   - Otherwise: just `agents.txt` with site identity, no capability blocks

3. **Do they already have `robots.txt`, `sitemap.xml`, `llms.txt`?**
   - If yes, leave them alone. `agents.txt` is additive.
   - If no, ask whether they want all four files or just `agents.txt`.

4. **How much automation do they want?**
   - Hand-write once (5 minutes, no dependencies)
   - Use a generator on every build (more setup, files stay in sync with config)
   - Use a runtime library that serves files dynamically (most server-frameworks)

Then pick the adoption path.

---

## Three adoption paths

### Path 1: Hand-write (recommended default)

The format is plain UTF-8 text. The minimum viable file:

```
# /agents.txt
# Spec: https://agents-txt.com

Site-Name: <name>
Site-URL: <https://...>
```

That's a valid `agents.txt`. It tells an agent the site exists, has a name, and announces nothing else. Most sites can stop here.

Add capability directives as needed. See [REFERENCE.md](REFERENCE.md) for the full directive list with examples. After writing the file, save it to whatever path the framework serves static assets from:

| Framework | Path |
|---|---|
| Astro | `public/agents.txt` |
| Next.js (any) | `public/agents.txt` |
| Hugo | `static/agents.txt` |
| Jekyll | `agents.txt` (root) |
| Vite | `public/agents.txt` |
| Express / Hono / Fastify | wherever your static handler points |

Companion `/agents.json` is recommended for any site that declares more than `Site-Name` and `Site-URL`. The structured form lets agents pre-screen capabilities without parsing plain text. See REFERENCE.md §`agents.json schema` for the layout.

**Tell the user to add `$schema` at the top of their hand-written `agents.json`:**

```json
{
  "$schema": "https://agents-txt.com/schema/agents-json/v1.0.json",
  "version": "1.0",
  "standard": "https://agents-txt.com",
  "site": { "name": "...", "url": "..." }
}
```

This is one extra line that earns inline validation and autocomplete in any JSON-aware editor (VS Code, JetBrains, `jq --schema`). A typo in `payments.mpp.methods`, a missing required field, a non-https URL surfaces in the editor before the file is ever served. The schema document lives on agents-txt.com as a static asset; the v1.0 URL is a frozen reference and is safe to embed in long-lived files.

### Path 2: Use a generator

If the user already maintains a build pipeline and wants their `agents.txt` to stay in sync with config (or they want to regenerate `robots.txt` / `llms.txt` / `sitemap.xml` alongside it), recommend the **`herald`** CLI. It is a sibling project (open-source, Apache 2.0, on npm) that emits all four discovery files from a single config object.

```bash
herald init
herald generate --out ./public
```

Mention herald as **one option among many**. It is *nice-to-have*, not required. The user is free to use any other generator (or write their own) - the spec is implementation-agnostic.

herald lives in a different repository and is documented separately. Do not attempt to install or import its code into this skill's flow; defer the setup steps to its own README/skill.

### Path 3: Serve dynamically from a server framework

If the user runs a server (Express, Hono, Next.js App Router, etc.) and wants the file generated per request based on runtime state, two sub-options:

1. **`@herald/addon`**: the herald project also ships framework adapters (`createAgenticRouter`, route handlers for App Router) that serve all four files from one config. Same caveat as Path 2: mention it as one option, not the only one.
2. **Hand-roll a route handler.** A minimal Express handler:

   ```ts
   app.get('/agents.txt', (_, res) => {
     res.type('text/plain').send(`Site-Name: ${SITE.name}\nSite-URL: ${SITE.url}\n`)
   })
   ```

   For static-shape `agents.txt` content, hand-rolling is often simpler than pulling in a library.

---

## Configure §4.5 serving headers

Putting the file in `public/` is necessary but not sufficient. Spec §4.5 requires four response headers on `/agents.txt` and `/agents.json`:

```
/agents.txt   : Content-Type: text/plain; charset=utf-8 + Access-Control-Allow-Origin: * + Cache-Control: public, max-age=3600
/agents.json  : Content-Type: application/json + Access-Control-Allow-Origin: * + Cache-Control: public, max-age=3600
```

Without `Access-Control-Allow-Origin: *`, browser-context agents (extensions, web playgrounds, in-app copilots) cannot read the files cross-origin and silently fail. Without `charset=utf-8`, browsers fall back to ISO-8859-1 and mojibake non-ASCII directive values.

Most static-asset pipelines do **not** set these by default. Help the user wire them up:

| User's hosting platform | What to do |
|---|---|
| **Cloudflare** Workers / Pages | Drop a `_headers` file in their `public/` (or `static/`) folder with the rules above. Cloudflare's static-assets pipeline applies it at the edge automatically. |
| **Netlify** | Same `_headers` file at the publish root. Identical syntax to Cloudflare. |
| **Vercel** | Add a `headers[]` array to `vercel.json` at the project root, with one entry per file. |
| **Nginx** | `add_header` directives inside the matching `location` block. |
| **Apache** | `Header set` in `.htaccess` or vhost config. |
| **Caddy** | `header` directive in their Caddyfile. |
| **AWS S3 + CloudFront** | Response Headers Policy on the distribution (or Lambda@Edge for finer control). |
| **Express / Hono / Next.js handlers** | Set the headers in the route handler that serves the file. The `@herald/addon` middleware already does this if the user adopted via Path 2. |

If the user is on Cloudflare, Netlify, or Vercel **and** they used `herald` (Path 2), they can run `herald generate --headers` and the CLI emits the right config based on its hosting-platform probe (or pass `--platform <name>` to override). For other hosts or hand-written sites, this step is manual.

After the headers are wired, point the user at `audit_site` (Validate the result, below) to confirm.

---

## Validate the result

After the file is in place, validate it (regardless of path). Two ways:

### A. Use the public MCP server

[`mcp.agents-txt.com`](https://mcp.agents-txt.com) exposes `validate_agents_txt` and `validate_agents_json` tools over Model Context Protocol for offline content validation, and the comprehensive `audit_site` tool for end-to-end checks of a live URL. Any MCP-aware client (Claude Desktop, mcp-inspector, etc.) can call them.

`audit_site` is what to run after deploy. It validates §4.5 serving headers (Content-Type, CORS, Cache-Control), runs the §3, §6–§11 directive validators on `agents.txt`, schema-validates `agents.json` per §5, scans both for accidental treasury / secret leaks per §5.4 / §14, and cross-checks consistency between `agents.txt` and `agents.json`. Output includes a roll-up `summary` block with `compliant` (boolean) and `errorCount` so it reads as a single pass/fail signal.

The `validate_agents_json` tool reports a fourth field alongside `valid` / `errors` / `warnings`: `notes`. This is the positive-observation channel. A recognised `$schema` reference at the top of the file shows up as `Schema reference present: <url>` in `notes`; absence produces a warning that includes the canonical hosted URL. The validator does not fetch the referenced schema document. Consumers wanting full JSON Schema conformance pull `@agentstxtdev/herald-schema` and run `AgentsJsonSchema.safeParse(json)` directly.

### B. Manual checks

For the user to run themselves:

```bash
# Confirm the file is reachable
curl -i https://example.com/agents.txt

# Headers should show:
#   HTTP/2 200
#   content-type: text/plain; charset=utf-8

# Body must:
#   - be UTF-8 (no BOM)
#   - start with `Site-Name:` or a comment
#   - end with a newline
```

For `agents.json`:

```bash
curl https://example.com/agents.json | jq .
# Must parse as valid JSON
# Must include a top-level `version: "1.0"` field
# Must include `site.name` and `site.url`
```

If the user has an `agents.txt` *and* an `agents.json`, confirm they declare the same capabilities. Mismatches cause agent confusion.

---

## Common pitfalls

- **Capability declaration without backing implementation.** If the user adds `Protocols: x402` to their `agents.txt` but has no `402` response handler, agents will fail. Always confirm the protocol they're declaring is actually wired up at the URL surface.
- **Wallet addresses in discovery files.** Wallet addresses, Stripe keys, MPP secret keys must **never** appear in `agents.txt` or `agents.json`. Those live in `402` response bodies and server env only.
- **Path inconsistency.** If they put `agents.txt` at `/static/agents.txt` instead of `/agents.txt`, agents won't find it. The standard requires the file at the root path.
- **Stale generated files.** If using a generator, run it on every deploy, not just locally. CI integration matters.
- **MCP without transport.** If they declare `MCP: https://example.com/mcp` in `agents.txt`, the URL must speak Streamable HTTP MCP, not just be a JSON endpoint. If they don't have an MCP server, drop the directive.
- **A2A URL without an AgentCard.** Each `A2A:` line MUST point to a valid AgentCard JSON document (a2a-protocol.org). If the URL returns 404 or a non-AgentCard document, drop the directive. Single-agent sites that already serve their AgentCard at the canonical `/.well-known/agent-card.json` do not need this block at all.
- **Inventing protocol identifiers.** If the user wants to advertise a protocol not registered in the spec (not `x402`, `mpp`, `agent-auth`), tell them to use the `x-` prefix per §3.1 (`x-mypay`, `x-myauth`). Parsers accept it; validators don't warn. Inventing an unprefixed identifier puts them outside the spec and triggers `unknown-protocol` warnings.

---

## When you should hand off

- **Spec questions** ("can I add a custom directive?", "what does `Authorization: agent-auth` actually mean for me?") → point them at [`spec/AGENTS-TXT-STANDARD.md`](https://agents-txt.com/spec) and offer to read the relevant section out loud.
- **herald CLI deep dives** ("how do I configure the firecrawl driver?") → tell them herald has its own setup skill and documentation in a separate repository; do not duplicate that work here.
- **Cloudflare / hosting setup** → out of scope; this skill assumes they have a working deploy pipeline.

---

## Reference

[REFERENCE.md](REFERENCE.md) carries the full directive list, `agents.json` schema, capability block examples (Payments / Authorization / MCP / Skills / A2A), and hand-write templates per framework. Open it inline whenever the user asks about a specific directive's syntax or fields.

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
# Spec: https://agentstxt.dev

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

### Path 2: Use a generator

If the user already maintains a build pipeline and wants their `agents.txt` to stay in sync with config (or they want to regenerate `robots.txt` / `llms.txt` / `sitemap.xml` alongside it), recommend the **`agentify`** CLI. It is a sibling project (open-source, Apache 2.0, on npm) that emits all four discovery files from a single config object.

```bash
npx agentify init
npx agentify generate --out ./public
```

Mention agentify as **one option among many**. It is *nice-to-have*, not required. The user is free to use any other generator (or write their own) - the spec is implementation-agnostic.

agentify lives in a different repository and is documented separately. Do not attempt to install or import its code into this skill's flow; defer the setup steps to its own README/skill.

### Path 3: Serve dynamically from a server framework

If the user runs a server (Express, Hono, Next.js App Router, etc.) and wants the file generated per request based on runtime state, two sub-options:

1. **`@agentify/web`**: the agentify project also ships framework adapters (`createAgenticRouter`, route handlers for App Router) that serve all four files from one config. Same caveat as Path 2: mention it as one option, not the only one.
2. **Hand-roll a route handler.** A minimal Express handler:

   ```ts
   app.get('/agents.txt', (_, res) => {
     res.type('text/plain').send(`Site-Name: ${SITE.name}\nSite-URL: ${SITE.url}\n`)
   })
   ```

   For static-shape `agents.txt` content, hand-rolling is often simpler than pulling in a library.

---

## Validate the result

After the file is in place, validate it (regardless of path). Two ways:

### A. Use the public MCP server

[`mcp.agentstxt.dev`](https://mcp.agentstxt.dev) exposes a `validate_agents_txt` (and `validate_agents_json`) tool over Model Context Protocol. Any MCP-aware agent (Claude Desktop, mcp-inspector, etc.) can call it. The site also exposes a one-shot `check_site` tool that fetches a live URL and scores compliance.

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

- **Capability declaration without backing implementation.** If the user adds `Payments: x402` to their `agents.txt` but has no `402` response handler, agents will fail. Always confirm the protocol they're declaring is actually wired up at the URL surface.
- **Wallet addresses in discovery files.** Wallet addresses, Stripe keys, MPP secret keys must **never** appear in `agents.txt` or `agents.json`. Those live in `402` response bodies and server env only.
- **Path inconsistency.** If they put `agents.txt` at `/static/agents.txt` instead of `/agents.txt`, agents won't find it. The standard requires the file at the root path.
- **Stale generated files.** If using a generator, run it on every deploy, not just locally. CI integration matters.
- **MCP without transport.** If they declare `MCP: https://example.com/mcp` in `agents.txt`, the URL must speak Streamable HTTP MCP, not just be a JSON endpoint. If they don't have an MCP server, drop the directive.

---

## When you should hand off

- **Spec questions** ("can I add a custom directive?", "what does `Authorization: agent-auth` actually mean for me?") → point them at [`spec/AGENTS-TXT-STANDARD.md`](https://agentstxt.dev/spec) and offer to read the relevant section out loud.
- **agentify CLI deep dives** ("how do I configure the firecrawl driver?") → tell them agentify has its own setup skill and documentation in a separate repository; do not duplicate that work here.
- **Cloudflare / hosting setup** → out of scope; this skill assumes they have a working deploy pipeline.

---

## Reference

[REFERENCE.md](REFERENCE.md) carries the full directive list, `agents.json` schema, capability block examples (Payments / Authorization / MCP / Skills), and hand-write templates per framework. Open it inline whenever the user asks about a specific directive's syntax or fields.

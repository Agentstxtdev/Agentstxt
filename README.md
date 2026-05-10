# agents.txt

**An open standard for AI agent capability declarations on the web.**

[![Spec: v1.0-draft](https://img.shields.io/badge/spec-v1.0--draft-111?style=flat-square)](spec/AGENTS-TXT-STANDARD.md)
[![License: CC0](https://img.shields.io/badge/license-CC0-lightgrey?style=flat-square)](spec/AGENTS-TXT-STANDARD.md)
[![Live: agentstxt.dev](https://img.shields.io/badge/live-agentstxt.dev-7c3aed?style=flat-square)](https://agentstxt.dev)
[![GitHub stars](https://img.shields.io/github/stars/agentstxt/agents.txt?style=flat-square&logo=github&logoColor=white&color=181717)](https://github.com/agentstxt/agents.txt)

`agents.txt` is the discovery file an AI agent reads to find out what your site supports (payments, authorization, MCP servers, agent skills) without needing to know the implementation details of any particular protocol.

It fills **Layer 4** of the agent-readiness stack:

```
Layer 1 — ACCESS CONTROL      /robots.txt   (RFC 9309)         "You may enter my house"
Layer 2 — PAGE INVENTORY      /sitemap.xml  (sitemaps.org 0.9) "Here's how to navigate it"
Layer 3 — CONTENT BRIEFING    /llms.txt     (llmstxt.org)      "Here's what's inside"
Layer 4 — AGENT CAPABILITIES  /agents.txt   (this spec)        "Here's what you can do here"
```

Where the existing layers handle access policies, indexes, and content guidance, `agents.txt` declares **what an agent can do**: pay, authenticate, connect to an MCP server, fetch installable skills. The implementation always lives in the protocol's own layer (`402` response bodies, `/.well-known/agent-configuration`, MCP transport, etc.); `agents.txt` is the announcement, never the duplicate.

This repository contains:

- **The spec**: [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md) (CC0)
- **A live reference deployment** at [agentstxt.dev](https://agentstxt.dev): Astro site + Cloudflare Worker
- **An MCP server** at [mcp.agentstxt.dev](https://mcp.agentstxt.dev): exposes the spec to agents via Model Context Protocol
- **An agent-auth Cloudflare Worker**: Ed25519 JWT verification, `/.well-known/agent-configuration`, capability execution

---

## What `agents.txt` looks like

```
# agents.txt
# Spec: https://agentstxt.dev

Site-Name: My Site
Site-URL: https://mysite.com

Payments: x402, mpp
Authorization: agent-auth
MCP: https://mysite.com/mcp
Skills: https://mysite.com/.well-known/skills.json
```

That's it. Six directives, plain UTF-8, served at `/agents.txt`. Each directive declares that the site *supports* a protocol; the protocol-specific details (pricing, scopes, transport, skill manifests) live in the protocol's own discovery surface.

The structured companion **`agents.json`** carries the same information in machine-friendly JSON with richer per-block detail (chain identifiers, default pricing, capability descriptions). Sites SHOULD serve both, same relationship as `llms.txt` ↔ `llms-full.txt`.

---

## Adopting the standard

You have three paths, in increasing automation:

### 1. Hand-write it

The format is plain text. Read [the spec](spec/AGENTS-TXT-STANDARD.md), copy the directives that apply to your site, save the file as `/agents.txt`. Repeat for `agents.json` if you want the structured companion. Total time: 5 minutes.

### 2. Generate it

The community reference generator [**agentify**](https://github.com/agentstxt/agents.txt) (a sibling project, distributed via npm) emits `agents.txt`, `agents.json`, `robots.txt`, `llms.txt`, and `sitemap.xml` from a single config file. Useful if you also want the lower layers of the stack regenerated alongside, or if you're hosting on Express / Hono / Next.js and want a payment middleware wired up automatically.

```bash
npx agentify init
npx agentify generate --out ./public
```

agentify is **a nice-to-have, not a requirement**. The spec is implementation-agnostic; anyone can write a generator in any language. agentify exists because we needed a first-party adoption path; it shouldn't dictate yours.

### 3. Look at the reference site

The live deployment at [agentstxt.dev](https://agentstxt.dev) is a working agentic site. Source: [`site/`](site/). It hand-rolls its `/donate` x402 + MPP endpoint inside [`site/src/worker.ts`](site/src/worker.ts) so you can read a real, dependency-free implementation of payment serving against the spec. Use it as a reference when building your own server.

---

## Repository layout

```
agentstxt/
├── spec/
│   └── AGENTS-TXT-STANDARD.md   — the formal specification (CC0)
│
├── site/                        — agentstxt.dev — Astro + Cloudflare Worker
│   ├── src/
│   │   ├── pages/               (homepage, /demo/*, /spec/*)
│   │   ├── worker.ts            (BFF + /donate payment proof, hand-rolled x402 v2)
│   │   └── ...
│   ├── public/                  (agents.txt, agents.json, llms.txt, llms-full.txt — generated artifacts)
│   ├── agentic.config.js
│   └── wrangler.json
│
├── mcp/                         — mcp.agentstxt.dev — Cloudflare Worker
│   └── src/                     (MCP server: get_spec, parse_agents_txt, validate_*, get_skill, check_site)
│
├── auth/                        — agent-auth — Cloudflare Worker
│   └── src/                     (Ed25519 JWT, KV agent state, /.well-known/agent-configuration,
│                                 /agent/register, /capability/execute)
│
├── landingpage/                 — agents-txt-landingpage (separate marketing site)
│
├── skills/                      — Claude/agent skills for working in this repo
│   └── adopt-agents-txt/        (helps a developer adopt the spec)
│
├── package.json                 — private monorepo root, orchestrates per-sub-pkg scripts
├── pnpm-workspace.yaml          — site, mcp, auth
├── README.md                    — this file
├── AGENTS.md                    — repo orientation for AI agents working on this codebase
├── CLAUDE.md                    — Claude-specific operating instructions for this repo
```

---

## Development

```bash
# Setup
cd agentstxt
nvm use 24
pnpm install

# Build everything (site + workers)
pnpm build

# Run tests (auth has 55, the others have none)
pnpm test

# Per sub-package
pnpm site:dev          # Astro dev server for agentstxt.dev
pnpm mcp:dev           # Wrangler dev for the MCP worker
pnpm auth:dev          # Wrangler dev for the agent-auth worker

pnpm site:deploy       # Astro build + wrangler deploy
pnpm mcp:deploy        # Wrangler deploy (minified)
pnpm mcp:deploy:prod
pnpm auth:deploy
pnpm auth:deploy:prod
```

Each sub-package owns its own toolchain: Astro for the site, Wrangler + `tsc --noEmit` for the workers. There is no Turbo at this level because the three workers have no shared dependency graph; they're three independent edge deployments to the same domain group.

---

## Status

**Spec:** v1.0-draft. Format and schema are stable. Major capability blocks (Payments, Authorization, MCP, Skills) are settled. Patches accepted via PR; structural changes will be RFCs against [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md).

**Reference deployment:** Live at [agentstxt.dev](https://agentstxt.dev). The MCP server is live at [mcp.agentstxt.dev](https://mcp.agentstxt.dev). The agent-auth worker runs as a separate service.

**Adoption:** Open. The spec is CC0; anyone can implement it without restriction. The reference workers in this repo are Apache 2.0; vendor in or fork freely.

---

## Contributing

PRs welcome on:

- **Spec** (`spec/AGENTS-TXT-STANDARD.md`): RFC-style discussion in the PR description for any structural change. Editorial fixes can ship directly.
- **Reference site** (`site/`): bug fixes, new demo pages, content updates.
- **MCP server** (`mcp/`): new tools, validator improvements.
- **Agent-auth worker** (`auth/`): capability extensions, scope improvements.

Issues and discussion: [github.com/agentstxt/agents.txt](https://github.com/agentstxt/agents.txt).

If you build a parser, generator, validator, or middleware for `agents.txt` in another language or framework — open a PR adding it to the implementations list (TBD section in the spec).

---

## License

- **Specification** (`spec/AGENTS-TXT-STANDARD.md`): [CC0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain. Implement, fork, vendor without permission or attribution.
- **Reference workers and site** (`site/`, `mcp/`, `auth/`, `landingpage/`): Apache 2.0.

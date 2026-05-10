# AGENTS.md: agentstxt repository

**For AI agents (Claude Code, Codex, Cursor, etc.) working on this codebase.**

This file is your orientation map. Read it before making changes.

---

## What this repository is

The **`agents.txt` standard** plus its **reference implementation**. Two distinct concerns sharing one workspace:

1. **The specification** at [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md). Formal, versioned, CC0. Defines a discovery file format that announces what an AI agent can do on a website (Payments, Authorization, MCP, Skills).
2. **A live deployment** at [agentstxt.dev](https://agentstxt.dev) that serves the spec, hosts demos, runs an MCP server, and an agent-auth worker. Three separate Cloudflare Workers, one Astro site.

Note: this repository does **not** contain the `agentify` npm toolkit. That is a sibling project (a generator + middleware that supports the spec) and lives in its own folder one level up. When working in this repo, you should not need it. If a user asks about generating files via the CLI, point them at agentify but do not import or assume it.

---

## Repository layout

```
agentstxt/
├── spec/
│   └── AGENTS-TXT-STANDARD.md  — formal spec (CC0)
│
├── site/                       — agentstxt.dev (Astro 6 + Cloudflare Worker)
│   ├── src/
│   │   ├── pages/              — homepage, /spec/*, /demo/*
│   │   ├── content/            — blog posts, MDX content
│   │   ├── components/         — Astro components
│   │   ├── layouts/            — page layouts
│   │   ├── worker.ts           — BFF that proxies /mcp + /agent/* to sibling workers,
│   │   │                          serves /donate as a hand-rolled x402 v2 + MPP proof
│   │   ├── config.ts
│   │   └── content.config.ts
│   ├── public/                 — generated artifacts: agents.txt, agents.json,
│   │                             llms.txt, llms-full.txt, robots.txt, sitemap.xml,
│   │                             plus `_headers` (Cloudflare config that satisfies
│   │                             spec §4.5: Content-Type charset, CORS, Cache-Control
│   │                             on /agents.txt and /agents.json)
│   ├── agentic.config.js       — config consumed by external generators
│   ├── astro.config.mjs
│   └── wrangler.json
│
├── mcp/                        — mcp.agentstxt.dev (Cloudflare Worker)
│   ├── src/                    — MCP server: get_spec, parse_agents_txt,
│   │                             validate_agents_txt, validate_agents_json,
│   │                             audit_site, get_skill
│   └── wrangler.json
│
├── auth/                       — agent-auth (Cloudflare Worker)
│   ├── src/                    — Ed25519 JWT, KV agent state, /.well-known/agent-configuration,
│   │                             /agent/register, /capability/execute
│   ├── wrangler.json
│   └── tests via Vitest (55 currently)
│
├── landingpage/                — agents-txt-landingpage (separate marketing site)
│
├── skills/                     — agent-installable skills for this repo
│   └── adopt-agents-txt/       — guides a developer through adopting the spec
│
├── package.json                — private root; per-sub-pkg convenience scripts
├── pnpm-workspace.yaml         — site, mcp, auth
└── README.md
```

All three workers (`site`, `mcp`, `auth`) deploy to Cloudflare and have no shared dependency graph. They are intentionally independent.

---

## What lives where

### Specification: `spec/AGENTS-TXT-STANDARD.md`

The single source of truth for the standard. Versioned (`v1.0-draft` at time of writing). Defines:

- Wire format (UTF-8 plain text, RFC 3629)
- Required and optional directives
- Companion `agents.json` schema (UTF-8 JSON, RFC 8259)
- Capability blocks: Payments, Authorization, MCP, Skills
- Conformance requirements

Treat this file as **load-bearing**. Changes here can break every parser, generator, and validator in the ecosystem.

### Reference site: `site/`

Astro 6, Cloudflare Workers (`@astrojs/cloudflare`), Tailwind v4. The site does three things:

1. **Hosts the spec text** at human-readable URLs (`/spec`, `/demo`, `/blog`).
2. **Demonstrates the spec live** by serving its own `/agents.txt`, `/agents.json`, etc. from `public/`.
3. **Acts as a Backend-for-Frontend (BFF)** via `src/worker.ts`: proxies `/mcp` to the MCP worker, `/.well-known/agent-configuration` and `/agent/*` to the auth worker, and self-serves `/donate` as a hand-rolled payment proof.

The `/donate` handler in `worker.ts` is a **deliberate self-contained reference**. It re-implements x402 v2 + MPP from scratch (no `@agentify/web` import) to demonstrate that a working agentic site can be ~150 lines of TypeScript against the protocols. Do not factor this out into a shared library inside this repo.

### MCP server: `mcp/`

A Cloudflare Worker exposing the `agents.txt` spec to AI agents over Model Context Protocol. Tools: `get_spec`, `parse_agents_txt`, `validate_agents_txt`, `validate_agents_json`, `audit_site`, `get_skill`. Built on `hono`, `@modelcontextprotocol/sdk`, `agents`. Deploys to `mcp.agentstxt.dev`.

`audit_site` does the heavy lifting: it fetches `/agents.txt`, `/agents.json`, and `/robots.txt`, validates the §4.5 serving headers (Content-Type, CORS, Cache-Control), runs the §3-§8 directive validators on `agents.txt`, schema-validates `agents.json` per §10, scans both files for accidental treasury / secret leaks per §10.4 / §12, and cross-checks that the two files declare consistent capabilities (payments / authorization / MCP / Skills). Out of scope: full RFC 9309 audit, sitemap.xml, llms.txt — those are governed by other specs.

### Agent-auth worker: `auth/`

A Cloudflare Worker implementing the agent-auth protocol referenced by the spec. Endpoints: `/.well-known/agent-configuration`, `/agent/register`, `/capability/execute`. Uses Ed25519 JWTs and Workers KV for agent state. Has 55 Vitest tests; keep them green.

---

## Working in this repo

### Setup

```bash
nvm use 24
pnpm install
pnpm build           # builds site + mcp + auth
pnpm test            # auth has tests; the others print "no tests"
```

### Per sub-package

```bash
pnpm site:dev
pnpm mcp:dev
pnpm auth:dev

pnpm site:deploy       # Astro build + wrangler deploy
pnpm mcp:deploy[:prod]
pnpm auth:deploy[:prod]
```

### Tech stack

- **Language:** TypeScript (NodeNext, strict mode)
- **Site:** Astro 6, Tailwind 4, Cloudflare Workers
- **Workers:** `wrangler` for dev/deploy, `tsc --noEmit` for typecheck
- **Tests:** Vitest (only the `auth` worker uses it currently)
- **Node:** ≥ 20.12

### What does **not** live here

- No npm-publishable packages. Nothing in `agentstxt/` is published.
- No Turbo. Three independent workers; nothing to orchestrate beyond `pnpm -r`.
- No shared TypeScript packages. Each sub-package owns its own deps.
- No agentify code. Treat agentify as an external sibling, even though it lives one folder up.

---

## Editing rules

These constraints exist to keep the spec credible, the reference deployment working, and the boundary with sibling repos clean.

### `spec/AGENTS-TXT-STANDARD.md`

- **Treat as the canonical artifact for the entire ecosystem.** Editorial polish (typos, clarifying examples) is fine via PR. Structural changes (new directives, schema fields, conformance shifts) require RFC discussion in the PR description.
- Bump the version line (`Version: 1.0-draft`) when changing semantics.
- Mirror any schema change into `agents.json` examples and any validator code in `mcp/src/` that asserts the schema.

### `site/`

- The site is the canonical *demonstration* of the spec. Its `public/agents.txt` and `public/agents.json` should always be valid against the latest published spec. If you change the spec, regenerate or hand-edit those files in the same PR.
- `worker.ts` is the reference x402 v2 + MPP implementation. Keep it self-contained. Do not import from `@agentify/*`. Do not move payment logic into a shared internal module.
- Astro pages serve user-facing content; do not put runtime logic in them. Push it into `worker.ts` or sibling workers.

### `mcp/`

- New MCP tools should be additive. Do not break existing tool signatures (`get_spec`, `parse_agents_txt`, etc.); third-party MCP clients may depend on them.
- When the spec changes, update `validate_agents_txt` / `validate_agents_json` to match. Tests in `auth/` cover auth invariants but the validator quality is on you to assess by exercising it against `site/public/agents.txt` and `agents.json`.

### `auth/`

- Cryptographic primitives (Ed25519 verification, JWT parsing) must not be hand-rolled outside the existing helpers. If a primitive is missing, prefer `@noble/*` libraries.
- Never log JWT bodies, KV values, or anything that could contain agent secrets.
- The 55 Vitest tests are the contract for the worker's behaviour. Always run `pnpm auth:test` before pushing changes there.

### General

- **Never commit** `.env`, `.dev.vars`, `wrangler-account.json`, secret keys, or wallet private keys.
- **Run `pnpm build`** before opening a PR; it catches type errors across all three workers.
- **Keep the three workers independent.** If two of them need the same code, write it twice; the duplication is intentional and small.
- **Follow existing code style.** No Prettier/Biome config inside `agentstxt/` yet; match the formatting you see.

---

## Skills available in this repo

Skills are agent-installable capability packages stored under `skills/`.

### `adopt-agents-txt`

Walks a developer through adopting the `agents.txt` standard on their own site. Covers reading the spec, choosing an adoption path (hand-write / generator / library), validating the output, and serving it correctly.

Use this skill when a user is working in *their own* repository and asks how to make their site agent-readable. It is **not** for working in this repo (the agentstxt monorepo itself).

---

## Outside the repo boundary

- **`agentify`** — an npm-published toolkit (CLI + framework adapters + payment middleware) that generates and serves the discovery files defined by this spec. It lives in a sibling folder, has its own README/AGENTS/CLAUDE, and is intentionally decoupled. Do not import its code into anything in this repo. Mention it to users only when they ask about automation.
- **`mppx`**: third-party SDK for Machine Payments Protocol. Used by `site/src/worker.ts` directly via `mppx/server`. Treat as an external dependency.
- **`@x402/*`**: Coinbase x402 v2 SDKs. **Not used by this repo.** `site/worker.ts` hand-rolls x402 v2 against the public facilitator at `https://x402.org/facilitator` instead, so the reference implementation can fit in one file.

---

## Quick reference: where to make changes

| Task | File / dir |
|---|---|
| Edit the spec | `spec/AGENTS-TXT-STANDARD.md` |
| Add a new demo page | `site/src/pages/demo/<name>.astro` |
| Change `/agents.txt` content served by the site | `site/public/agents.txt` (re-generate or hand-edit) |
| Modify the BFF / `/donate` payment endpoint | `site/src/worker.ts` |
| Add an MCP tool | `mcp/src/` |
| Extend agent-auth capabilities | `auth/src/` (and add a Vitest case) |
| Adjust top-level scripts | `package.json` (root of `agentstxt/`) |

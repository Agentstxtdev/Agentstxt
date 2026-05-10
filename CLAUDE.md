# CLAUDE.md: agentstxt repository

**For Claude instances working on this codebase.** Read [AGENTS.md](AGENTS.md) first for the orientation map and editing rules; this file holds the Claude-specific operating instructions, skill pointers, and pitfalls.

---

## Identity of this repo

This repository is the **agents.txt standard** plus its **reference deployment**. It is *not* the `agentify` toolkit. Keep the boundary clear in everything you write:

- The spec is at [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md). Treat it as canonical.
- The reference deployment is three independent Cloudflare Workers (`site/`, `mcp/`, `auth/`) plus a marketing site (`landingpage/`).
- agentify is a sibling project that generates files conforming to this spec. Do not import from it. Do not assume it. Mention it to users only as a *nice-to-have adoption path*, never as a dependency.

---

## Skills

Skills are loaded automatically by the Claude harness when their description matches a user's intent. This repo ships one:

### `/adopt-agents-txt`

Walks a developer through **adopting the `agents.txt` standard on their own site**. Covers the spec, the three adoption paths (hand-write / generator / library), validation, and correct serving.

Use it when:

- A user wants their site to be agent-readable
- A user asks "how do I add agents.txt to my project"
- A user wants to validate their existing `agents.txt` / `agents.json`

Do **not** use it when:

- The user is editing files inside `agentstxt/` itself (then follow `AGENTS.md` repo rules)
- The user wants to publish or extend the spec (that's RFC-style PR work)

The skill must stay neutral on tooling. It explains the spec first, then lists the adoption paths in increasing automation, with `agentify` mentioned as one option among hand-writing and writing a custom generator.

- [adopt-agents-txt SKILL.md](skills/adopt-agents-txt/SKILL.md): operating instructions
- [adopt-agents-txt REFERENCE.md](skills/adopt-agents-txt/REFERENCE.md): full spec quick-reference, validators, examples

---

## Tech stack at a glance

- **Language:** TypeScript (NodeNext, strict)
- **Site:** Astro 6, Tailwind 4, Cloudflare Workers (`@astrojs/cloudflare`)
- **Workers:** wrangler for dev/deploy, `tsc --noEmit` for typecheck
- **Test runner:** Vitest (auth worker only; 55 tests must stay green)
- **Package manager:** pnpm workspaces (`pnpm-workspace.yaml`)
- **Node:** ≥ 20.12, develop on Node 24 (`nvm use 24`)

---

## Commands you'll use

```bash
# from agentstxt/ root
pnpm install
pnpm build                   # runs build across site, mcp, auth
pnpm test                    # auth's 55 tests

# per sub-package
pnpm site:dev                # Astro dev server
pnpm mcp:dev                 # wrangler dev for the MCP worker
pnpm auth:dev                # wrangler dev for the agent-auth worker

pnpm site:deploy             # Astro build + wrangler deploy
pnpm mcp:deploy / :prod
pnpm auth:deploy / :prod
```

For workers, **before suggesting a deploy** confirm the user has `wrangler whoami` set up and the relevant secrets (`MPP_SECRET_KEY`, `STRIPE_SECRET_KEY`, treasury env vars) bound via `wrangler secret put`.

---

## Hard rules: what NOT to do

These rules exist to keep the spec credible and the reference deployment self-contained.

### Do not modify the spec without RFC discipline

`spec/AGENTS-TXT-STANDARD.md` is the load-bearing artifact for the entire ecosystem. Rules:

- **Editorial polish** (typos, clarifying examples, broken links) → fine, ship it.
- **Structural changes** (new directives, schema fields, conformance shifts, version bumps) → require an RFC-style description in the PR. Discuss before merging.
- **Always bump `Version:`** when semantics change.
- **Always mirror schema changes** into `mcp/src/` validators and the `agents.json` example output in `site/public/agents.json`.
- **Never** introduce vendor-specific assumptions (e.g. "x402 must use Coinbase facilitator" or "MPP must use Stripe"). The spec is protocol-agnostic by design.

### Do not import `@agentify/*` anywhere

`site/`, `mcp/`, `auth/` deliberately do not depend on the `agentify` npm packages. The reference site re-implements x402 v2 + MPP from scratch in `site/src/worker.ts` so a developer reading it can see the protocols at the wire level without indirection. Do not factor that out into a shared library or replace it with `@agentify/web` calls.

### Do not couple the three workers

`site/`, `mcp/`, `auth/` have no shared dependency graph and no shared internal modules. If two of them need the same helper, **write it twice**. The duplication is intentional and tiny. Adding a shared `packages/` folder here defeats the "three independent edge deployments" property.

### Do not introduce Turbo

There is no `turbo.json` in this repo and there should not be. The three workers don't form a build graph. `pnpm -r run build` is the only orchestration needed.

### Do not log secrets

`auth/` handles JWT bodies and KV values; `site/worker.ts` reads `STRIPE_SECRET_KEY`, `MPP_SECRET_KEY`. None of these may appear in `console.log` / `console.error` / Sentry breadcrumbs / response bodies. If you need a debug shortcut, add it behind `DEBUG === '1'` and gate it explicitly.

### Do not hand-roll cryptographic primitives

Ed25519 verification in `auth/` uses `@noble/*` libraries. JWT parsing uses the same. If a primitive is missing, install a vetted package; never re-implement curve math, hashes, or signature verification.

### Do not commit secrets, env files, or wallet keys

Specifically: `.env`, `.dev.vars`, `.dev.vars.production`, `wrangler-account.json`, anything matching `*-secret*`, `*-private*.{json,pem,key}`. If you see one staged, abort the commit and tell the user.

### Do not run destructive operations without confirming

This includes `wrangler delete`, `wrangler kv:bulk delete`, force-pushes to a remote branch, `rm -rf` on anything outside the current worker's `dist/`/`.wrangler/`. Always confirm with the user.

---

## What to do when…

### …the user asks "how do I make my site readable by agents?"

Trigger `/adopt-agents-txt`. The skill walks them through reading the spec, choosing an adoption path, and validating their output. Don't volunteer the agentify CLI as a default; present it as one of three adoption paths.

### …the user asks to change a directive in the spec

1. Open `spec/AGENTS-TXT-STANDARD.md`, locate the directive's section.
2. Confirm with the user whether the change is editorial or structural.
3. For structural changes, draft an RFC-style summary first (Why / Compat / Migration) and ask before editing.
4. Bump the `Version:` line if semantics change.
5. Mirror the change into `mcp/src/` validators and `site/public/agents.json`.

### …the user wants to add an MCP tool

1. Add the tool definition + handler in `mcp/src/`.
2. Register it via the MCP SDK pattern already used in the file.
3. Run `pnpm mcp:dev` and exercise it from a local MCP client (`@modelcontextprotocol/inspector` or similar).
4. Update `mcp/README.md` if the tool changes the public surface.
5. Do not mutate existing tool signatures; third-party clients depend on them.

### …the user wants to extend agent-auth capabilities

1. Add the capability handler in `auth/src/`.
2. Update `/.well-known/agent-configuration` to advertise it.
3. Write Vitest cases that cover both the happy path and the unauthorized path.
4. `pnpm auth:test`: must end at 55+ passing tests, never fewer.

### …the user wants to demo something on the site

1. New page goes in `site/src/pages/demo/<name>.astro`.
2. Static demos: pure Astro / HTML.
3. Interactive demos that need server logic: extend `site/src/worker.ts` with a new pathname check; do not invent a separate worker for it.
4. Re-generate `site/public/agents.txt` and `agents.json` if the demo declares a new capability the site formally supports.

### …the user mentions agentify

Acknowledge it as a sibling project that helps adopt this spec. Mention it lives in a different folder (the user's local clone hierarchy will tell them where) and that it is not imported anywhere here. Do not run `npm install @agentify/web` or similar inside this repo. Do not assume the user is using agentify just because they're working in this repo.

### …a build fails

1. `pnpm install` from a clean state if the lockfile changed.
2. Confirm Node 24 (`node -v`).
3. For wrangler errors, check `wrangler --version` (≥ 4) and that the relevant secrets exist.
4. For Astro errors, look at `site/.astro/` for cached state and clear it.
5. Don't fix a worker by importing code from a sibling worker; fix it within its own boundary.

---

## File-touching etiquette

- **Edit existing files** rather than creating new ones unless the new file has a clear home (a new page, a new tool, a new test).
- **No emojis** in code, commit messages, file names, or PR descriptions unless the user explicitly requests them.
- **No "AI-assisted" preambles** in code comments. Write the code, not the meta-narrative.
- **Match existing style.** This repo doesn't run Prettier or Biome; match the indentation, quotes, semicolons of the file you're editing.
- **Comments only when the why is non-obvious.** Code that's self-evident does not need narration. Reserve comments for invariants, gotchas, deliberate quirks.

---

## Boundary table (where lookups go)

| Question | Source of truth |
|---|---|
| What does directive X mean? | `spec/AGENTS-TXT-STANDARD.md` |
| What's the wire format of `agents.json`? | `spec/AGENTS-TXT-STANDARD.md` §10 |
| What MCP tools does the server expose? | `mcp/src/` (read the actual handlers) |
| What's the agent-auth handshake? | `auth/src/` + `/.well-known/agent-configuration` response |
| How does `/donate` settle x402 payments? | `site/src/worker.ts` (hand-rolled, ~150 lines) |
| Which Cloudflare bindings does each worker need? | each worker's `wrangler.json` |
| What's the agentify CLI / middleware contract? | **Out of scope.** Go to the agentify repo. |

# CLAUDE.md: agentstxt repository

**For Claude instances working on this codebase.** Read [AGENTS.md](AGENTS.md) first for the orientation map and editing rules; this file holds the Claude-specific operating instructions, skill pointers, and pitfalls.

---

## Identity of this repo

This repository is the **agents.txt standard** plus its **reference deployment**. It is *not* the `herald` toolkit. Keep the boundary clear in everything you write:

- The spec is at [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md). Treat it as canonical.
- The reference deployment is three independent Cloudflare Workers (`site/`, `mcp/`, `auth/`) plus a marketing site (`landingpage/`).
- herald is a sibling project that generates files conforming to this spec. Do not import from it. Do not assume it. Mention it to users only as a *nice-to-have adoption path*, never as a dependency.

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

The skill must stay neutral on tooling. It explains the spec first, then lists the adoption paths in increasing automation, with `herald` mentioned as one option among hand-writing and writing a custom generator.

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

For workers, **before suggesting a deploy** confirm the user has `wrangler whoami` set up and the relevant env vars bound via `wrangler secret put` or `vars` in `wrangler.json`. Site worker reads `SOLANA_ADDRESS` (for `/x402`); `TREASURY_TEMPO`, `STRIPE_SECRET_KEY`, `STRIPE_NETWORK_ID`, and `MPP_SECRET_KEY` (for `/mpp`). Each route independently returns 503 with an `endpoint_inactive` JSON body when its prerequisites are absent, so partial configurations are safe.

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

### Do not import `@herald/*` anywhere

`site/`, `mcp/`, `auth/` deliberately do not depend on the `herald` npm packages. The reference site re-implements x402 v2 + MPP from scratch in `site/src/worker.ts` so a developer reading it can see the protocols at the wire level without indirection. Do not factor that out into a shared library or replace it with `@herald/addon` calls.

### Do not couple the three workers

`site/`, `mcp/`, `auth/` have no shared dependency graph and no shared internal modules. If two of them need the same helper, **write it twice**. The duplication is intentional and tiny. Adding a shared `packages/` folder here defeats the "three independent edge deployments" property.

### Do not introduce Turbo

There is no `turbo.json` in this repo and there should not be. The three workers don't form a build graph. `pnpm -r run build` is the only orchestration needed.

### Do not log secrets

`auth/` handles JWT bodies and KV values; `site/worker.ts` reads `SOLANA_ADDRESS`. None of these may appear in `console.log` / `console.error` / Sentry breadcrumbs / response bodies (the wallet address itself is public and may be logged, but JWTs and KV contents must not). If you need a debug shortcut, add it behind `DEBUG === '1'` and gate it explicitly.

### Do not hand-roll cryptographic primitives

Ed25519 verification in `auth/` uses `@noble/*` libraries. JWT parsing uses the same. If a primitive is missing, install a vetted package; never re-implement curve math, hashes, or signature verification.

### Do not commit secrets, env files, or wallet keys

Specifically: `.env`, `.dev.vars`, `.dev.vars.production`, `wrangler-account.json`, anything matching `*-secret*`, `*-private*.{json,pem,key}`. If you see one staged, abort the commit and tell the user.

### Do not run destructive operations without confirming

This includes `wrangler delete`, `wrangler kv:bulk delete`, force-pushes to a remote branch, `rm -rf` on anything outside the current worker's `dist/`/`.wrangler/`. Always confirm with the user.

---

## What to do when…

### …the user asks "how do I make my site readable by agents?"

Trigger `/adopt-agents-txt`. The skill walks them through reading the spec, choosing an adoption path, and validating their output. Don't volunteer the herald CLI as a default; present it as one of three adoption paths.

### …the user asks to change a directive in the spec

1. Open `spec/AGENTS-TXT-STANDARD.md`, locate the directive's section.
2. Confirm with the user whether the change is editorial or structural.
3. For structural changes, draft an RFC-style summary first (Why / Compat / Migration) and ask before editing.
4. Bump the `Version:` line if semantics change.
5. Mirror the change into `mcp/src/` validators and `site/public/agents.json`.

### …the user wants to add a new protocol or capability block

Three paths exist; pick by formalization level. Default to suggesting the lightest one that fits the user's actual need.

**Path A: experimental (`x-` prefix), no spec change.** A site advertises an unregistered protocol with the `x-` prefix per §3.1 (`Protocols: x402, x-mypay`, or `payments["x-mypay"]: {}` in `agents.json`). Parsers must accept; validators must not warn. The reference deployment already accepts `x-` identifiers without warnings via `isAcceptedPaymentIdentifier` / `isAcceptedAuthIdentifier` in `mcp/src/protocols.ts`. No code or spec edits required.

**Path B: register an identifier in an existing block (§8 Payments or §11 Authorization).** The protocol fits an existing block's semantics and is stable enough to standardize. Steps:
1. PR against `spec/AGENTS-TXT-STANDARD.md`: add a subsection to §8 or §11 describing what the identifier signals and where the protocol's own details live.
2. Bump `Version:`.
3. Append the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS` in `mcp/src/protocols.ts`. Validators and `audit_site` follow automatically.
4. If the protocol has structured fields in `agents.json`, document the per-protocol object in §5.2 and §5.3, then add the JSON shape check in `mcp/src/tools/validate_agents.ts` and `audit_site.ts` next to the existing x402 and MPP blocks.

**Path C: new capability block (the A2A path).** The protocol does not fit any existing block. This is what A2A required in v1.0. Steps:
1. Spec section in `AGENTS-TXT-STANDARD.md`: directive name, wire format (single value per line, repeatable, HTTPS-only), the discovery gap the block fills, relationship to existing blocks.
2. Directive table entry in §3.1.
3. `agents.json` schema entry in §5.2 plus field notes in §5.3. For URL-carrying blocks mirror the `mcp[]` / `skills[]` shape: `{ url, description? }`, description is `agents.json`-only.
4. Register the directive in `BLOCK_OPENERS` inside `mcp/src/protocols.ts`. This is the distinction between "expected block opener" and "unknown directive surfaced under `extensions`".
5. Parser case in `mcp/src/tools/parse_agents_txt.ts`.
6. Validation rules in `mcp/src/tools/validate_agents.ts` (txt URL shape + HTTPS, json array shape).
7. Audit rules in `mcp/src/tools/audit_site.ts`: §N directive check, §5.2 array check, plus the cross-file consistency check that the URL set in `agents.txt` equals the URL set in `agents.json`.
8. If the new block is inserted before any existing section, renumber subsequent sections everywhere they are referenced (search the audit code for `§` to find every literal).
9. If `site/` adopts the new block, regenerate or hand-edit `site/public/agents.txt` and `site/public/agents.json` in the same PR.

Default behaviour: when a user mentions a brand-new protocol, suggest Path A first. Move to Path B or C only when there is a stable spec on the other side and ecosystem demand. Never silently extend `PAYMENT_PROTOCOLS` / `AUTH_PROTOCOLS` without confirming the spec status.

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

### …the user asks about §4.5 serving compliance for the site

1. The site satisfies §4.5 via `site/public/_headers` (Cloudflare Workers Static Assets format). It declares `Content-Type: text/plain; charset=utf-8` for `/agents.txt`, `Content-Type: application/json` for `/agents.json`, `Access-Control-Allow-Origin: *` on both, and `Cache-Control: public, max-age=3600`.
2. Astro copies `public/_headers` to `dist/client/_headers` at build; the adapter-generated `dist/server/wrangler.json` resolves `assets.directory` to `../client`, so wrangler picks it up at deploy.
3. Verify after deploy by calling the MCP `audit_site` tool against `https://agentstxt.dev` (e.g. via `mcp.agentstxt.dev/mcp`); a clean run reports `corsAllOrigins: true`, the right `Content-Type`, and a present `Cache-Control` for both files.
4. Localhost (`astro dev`) does NOT honor `_headers`. The §4.5 errors that appear when auditing `http://localhost:4321` are expected; the spec governs production, not dev preview. If a developer asks for dev/prod parity (so `audit_site` passes against `localhost` too), point them at three options without prescribing one: audit the production URL instead, hand-roll a small middleware that parses `_headers` and applies the matching headers (~30 lines), or use their generator's dev shim if it ships one (the sibling `herald` project exposes `heraldHeadersVitePlugin` / `heraldHeadersConnect` / `heraldHeadersHono` from `@herald/addon/dev` for adopters already using it; Next.js sites can mirror the rules in `next.config.js` `async headers()`). Do not import any of these into this repo — the agentstxt deployment intentionally has no `@herald/*` dependency.

### …the user adds a new well-known path (or any new static discovery file)

Static files use `_headers`; dynamic worker routes set headers in code. The rule splits on how the path is served, not on what it contains.

- **Static file** (anything under `site/public/`, including `public/.well-known/*.json`): Cloudflare's static asset pipeline serves it. Response headers come from `_headers` and nowhere else. Add a new block to `site/public/_headers` mirroring the `/agents.json` shape (`Content-Type`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`). Without the entry the file still responds 200, but no CORS header is set and any browser-context client on another origin gets a CORS error.
- **Dynamic route** (anything proxied by `site/src/worker.ts` to the auth worker, MCP worker, or handled directly): the handler sets response headers in code. `_headers` does not apply to dynamic worker routes. Make sure the handler emits `Content-Type`, `Access-Control-Allow-Origin: *`, and (where appropriate) `Cache-Control` itself. The existing `/.well-known/agent-configuration` proxy in the auth worker is the reference pattern.

Worked examples in the repo. `/agents.txt` and `/agents.json` are static and have `_headers` entries (spec §4.5 mandates these). `/.well-known/agent-card.json` is static (A2A reference card) and has a matching `_headers` entry. `/.well-known/agent-configuration` is dynamic (served by the agent-auth worker) and gets its headers in `auth/src/`.

agents.txt spec §4.5 mandates headers only for `/agents.txt` and `/agents.json`. For any other discovery surface the headers are an implementation concern (CORS in particular is load-bearing for browser-context clients). When in doubt, mirror the `/agents.json` shape.

**The four ecosystem discovery surfaces published by this deployment.** Four complementary discovery files sit alongside `agents.txt` / `agents.json` and are advertised via RFC 8288 `Link:` headers on `/`. Each one corresponds to a separate spec maintained by another working group. agents.txt v1.0 does not mandate any of them; they make the site readable by scanners that follow the corresponding RFC. All four are static, all four live under `site/public/`, and all four are generated by `herald emit` (see the herald section below), so hand-edits get overwritten on the next emit.

| Path | Standard | Source-of-truth field in `agentsjson.config.js` |
|---|---|---|
| `/.well-known/api-catalog` | RFC 9727 (`application/linkset+json`) | Derived from `mcp` / `a2a` / `ucp` blocks. No new field; the catalog lists every anchor those blocks already declare. |
| `/.well-known/mcp/server-card.json` | SEP-2127 | `mcp.serverCard = { name, version, capabilities: { tools, resources, prompts } }`. |
| `/.well-known/agent-skills/index.json` | agentskills.io Discovery v0.2.0 | Each `skills.urls` entry gains `name?`, `type?`, and `digest: "sha256:<hex>"`. Missing digest skips the entry with a warning at emit time. |
| `/openapi.json` | OpenAPI 3.1 + `x-payment-info` (paymentauth.org Payment Discovery draft) | `payments.openapi.paths` map of pathname to `{ summary?, description?, offers[] }`. Single-offer paths use the direct shorthand; multi-offer paths use the `offers[]` array form. |

The `_headers` file gets matching `Content-Type` + CORS rules and an RFC 8288 `Link:` block on `/` listing every surface above. herald emits all of this when it sees the corresponding config block; never hand-edit `_headers` to add an entry for a file `herald emit` doesn't produce, because the next run will overwrite it.

These surfaces are published despite not being part of the agents.txt spec because the wider agent-readiness ecosystem (Cloudflare's `isitagentready.com`, agentic-API auditors, MCP Registry scrapers) probes these paths alongside `agents.txt`. Maintaining them is the cost of being readable by every scanner. agents.txt remains the canonical capability declaration.

### …the user asks how `agents.json` and the deployed worker stay in sync on x402 / MPP credentials

The honest-declarations gate at the top of `agentsjson.config.js` (`hasX402 = !!(process.env.EVM_ADDRESS || process.env.SOLANA_ADDRESS)`, etc.) reads `process.env` at build time. The worker reads wrangler secrets at runtime. These are two independent layers. A consequence: the env var must be present in the shell that runs `herald emit` for the payments block to land in `agents.json`; setting it only via `wrangler secret put` populates the runtime but leaves the static `agents.json` advertising fewer protocols than the worker actually serves.

The deploy recipe that keeps both layers in sync:

```bash
source ~/.nvm/nvm.sh && nvm use 24
cd app/site
set -a; source .dev.vars; set +a            # build-time env from the same file
node ../../../agentify/packages/cli/dist/cli.js emit --out ./public
pnpm run deploy                              # astro build && wrangler deploy
```

`/openapi.json` is intentionally not gated this way (see [`agentsjson.config.js`](app/site/agentsjson.config.js) `payments.openapi` block). It is a protocol-capability advertisement, not a credential-presence signal; emitting it always is consistent with the wire-activation gate living in the worker, which returns `503 endpoint_inactive` per route when its specific credentials are missing.

### …the user asks about the Markdown for Agents content negotiation on `/`

The site supports `Accept: text/markdown` content negotiation on HTML page paths (`/`, `/spec`, `/demo`, `/demo/<name>`). When a request matches the allowlist regex `PAGE_PATHS = /^\/(spec|demo(\/[^/]+)?)?$/` and carries `Accept: text/markdown`, the worker fetches `/llms-full.txt` from `env.ASSETS` and returns its body with `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`, and the same CORS / Cache-Control as the static-asset version.

Two design notes worth keeping:

1. **The page-path allowlist is load-bearing.** A coarser filter like `!pathname.includes('.')` would also intercept `/x402` and `/mpp` (the protocol routes), shadowing the 402 challenge when an agent accidentally sends the markdown accept header. The explicit regex is what isolates content negotiation to actual HTML pages.
2. **`wrangler.json` carries `assets.run_worker_first: true`.** Without that flag, Cloudflare's static-asset pipeline serves `dist/index.html` directly on `GET /` and the worker never runs, so the markdown branch never executes. The flag routes every request through the worker first; the worker's tail `return env.ASSETS.fetch(request)` still serves static assets for everything that does not match a handler branch. The trade-off (one extra worker invocation per static asset request) is within the Workers free tier for this site.

When (if) Cloudflare's managed `content_converter` zone setting becomes available for this account, the worker branch can be retired; today the managed setting is documented but not exposed via the `/zones/<id>/settings/content_converter` API for this Pro-plan zone, so the worker fallback is the production path.

### …the user asks to add or change an MCP audit check

The MCP `audit_site` tool lives at `mcp/src/tools/audit_site.ts` (function: `registerAuditSite`). Scope is intentionally limited to the agents.txt spec: §3, §6–§11 directive validation, §5 schema validation, §4.5 serving headers, §5.4 / §14 secret-leak scan, and `agents.txt` vs `agents.json` cross-file consistency. A light-touch check on `robots.txt` confirms `Allow: /agents.txt` is present (the §4.3 discovery surface). RFC 9309, sitemap.xml, and llms.txt are out of scope; do not extend the tool to audit them.

### …the user mentions herald

Acknowledge it as a sibling project that helps adopt this spec. Mention it lives in a different folder (the user's local clone hierarchy will tell them where) and that it is not imported anywhere here. Do not run `npm install @herald/addon` or similar inside this repo. Do not assume the user is using herald just because they're working in this repo.

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
| What's the wire format of `agents.json`? | `spec/AGENTS-TXT-STANDARD.md` §5 |
| What's the A2A block / `A2A:` directive? | `spec/AGENTS-TXT-STANDARD.md` §9 |
| What identifiers are registered? | `mcp/src/protocols.ts` (single source of truth) |
| What MCP tools does the server expose? | `mcp/src/` (read the actual handlers) |
| What's the agent-auth handshake? | `auth/src/` + `/.well-known/agent-configuration` response |
| How does `/x402` serve a 402 and settle x402 v2 payments? | `site/src/worker.ts` (hand-rolled against `x402.org/facilitator/settle`) |
| How does `/mpp` emit a `WWW-Authenticate: Payment` challenge? | `site/src/worker.ts` (`Mppx.compose(tempo, stripe)(request)` via the `mppx` SDK) |
| Which Cloudflare bindings does each worker need? | each worker's `wrangler.json` |
| What's the herald CLI / middleware contract? | **Out of scope.** Go to the herald repo. |
| What's in `/.well-known/api-catalog`? | RFC 9727 linkset; generated by herald from `agentsjson.config.js` `mcp` / `a2a` / `ucp` blocks. |
| What's in `/.well-known/mcp/server-card.json`? | SEP-2127 server card; generated from `agentsjson.config.js` `mcp.serverCard`. |
| What's in `/.well-known/agent-skills/index.json`? | agentskills.io v0.2.0 discovery index; generated from `agentsjson.config.js` `skills.urls` entries that carry a `digest`. |
| What's in `/openapi.json`? | OpenAPI 3.1 with `x-payment-info` per the Payment Discovery draft; generated from `agentsjson.config.js` `payments.openapi.paths`. |
| Why does `wrangler.json` have `run_worker_first: true`? | The Markdown for Agents fallback in `site/src/worker.ts` needs to intercept `GET /` before the static-asset pipeline returns `dist/index.html`. |
| Why doesn't the deployed `agents.json` have `payments.x402` even though the worker serves a 402 there? | The env-var gate at build time. `herald emit` ran without `SOLANA_ADDRESS` in the shell. Re-run `set -a; source .dev.vars; set +a; node ... emit` then redeploy. |

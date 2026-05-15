# Contributing to agents-txt

Thanks for taking the time to contribute. agents-txt is the `agents.txt` open standard plus its reference deployment. Two distinct concerns share this repository, with different review bars:

- **The specification** at [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md) is the load-bearing artifact for the entire ecosystem. Changes here can break every parser, generator, and validator in the wild.
- **The reference deployment** (three Cloudflare Workers + a marketing landing page) is operational code. Changes here only affect agents-txt.com and its sister deployments.

This guide covers what's specific to this repository. For overall architectural rules and the orientation map, read [`AGENTS.md`](AGENTS.md) (codebase guide) and [`CLAUDE.md`](CLAUDE.md) (operating instructions for AI agents; humans benefit too).

---

## Before you start

- agents-txt is the **spec + reference deployment**. It is *not* the place for the `herald` toolkit; that lives in a sibling project. Do not import `@herald/*` anywhere here.
- Open an issue or RFC discussion **before** sending any PR that touches `spec/AGENTS-TXT-STANDARD.md`. Editorial fixes (typos, broken links) are fine without a heads-up; structural changes are not.
- Run on **Node 24 (`nvm use 24`)** and **pnpm 10**. The lockfile is committed; respect it (`pnpm install --frozen-lockfile`).

---

## Setup

```bash
git clone https://github.com/agents-txt/agents-txt
cd agents-txt

nvm use 24
pnpm install
pnpm build       # builds site + mcp + auth via pnpm -r
pnpm test        # auth's 55 Vitest tests
```

If anything in that sequence fails on a clean clone, that's a bug. Please file an issue with the failing output before trying to fix something else.

---

## Daily workflow

```bash
# Per sub-package dev servers
pnpm site:dev      # Astro dev server for agents-txt.com
pnpm mcp:dev       # wrangler dev for the MCP worker
pnpm auth:dev      # wrangler dev for the agent-auth worker

# Per sub-package builds (each has its own toolchain)
pnpm site:build    # Astro build → dist/
pnpm mcp:build     # tsc --noEmit
pnpm auth:build    # tsc --noEmit
pnpm auth:test     # Vitest, 55 tests

# Deploy (manual; CI does not auto-deploy)
pnpm site:deploy
pnpm mcp:deploy / pnpm mcp:deploy:prod
pnpm auth:deploy / pnpm auth:deploy:prod
```

---

## What goes where

| Change type | Location | Review bar |
|---|---|---|
| Spec wording, typos, examples | `spec/AGENTS-TXT-STANDARD.md` | Editorial, light review |
| Spec semantics (new directives, schema fields) | `spec/AGENTS-TXT-STANDARD.md` | RFC discipline (see below) |
| Astro site page or content | `site/src/pages/` or `site/src/content/` | Standard |
| BFF and `/x402` + `/mpp` demo routes | `site/src/worker.ts` | Standard, must stay self-contained (no `@herald/*` imports) |
| Generated discovery files served by site | `site/public/agents.txt`, `agents.json`, `llms.txt`, `llms-full.txt`, `robots.txt`, `sitemap.xml` | Must validate against the latest spec |
| Hosted JSON Schema (`site/public/schema/agents-json/v*.json`) | Regenerated from the Zod source in `@agentstxtdev/herald-schema` (lives in the herald repo). Do not hand-edit. Re-emit with `pnpm --filter @agentstxtdev/herald-schema emit:json-schema /path/to/agents-txt/app/site/public/schema` from the herald repo and commit the result here. | The file is the wire-format contract for editors. Any change must be paired with a spec-version bump on the herald side. |
| MCP tool | `mcp/src/` | Tool signatures must stay backward-compatible. `validate_agents_json` returns `{ valid, errors, warnings, notes }`; `notes` is the positive-observation channel and is append-only. |
| Agent-auth capability | `auth/src/` + Vitest case | Cryptographic primitives via `@noble/*`, not hand-rolled |
| Landing page | `landingpage/` | Standard |
| Skills | `skills/<skill-name>/` | Documentation-style review |

Detailed architecture and editing rules per surface: [`AGENTS.md`](AGENTS.md).

---

## Hard rules

These are non-negotiable. Violations get sent back without further review.

1. **The three Cloudflare Workers stay independent.** `site/`, `mcp/`, `auth/` have no shared dependency graph and no shared internal modules. If two of them need the same helper, **write it twice**. Adding a `packages/` folder here defeats the "three independent edge deployments" property.
2. **No `@herald/*` imports anywhere in this repo.** `site/src/worker.ts` is a deliberate self-contained x402 v2 reference at `/x402` and a deliberate self-contained MPP reference at `/mpp` (via `mppx/server`); do not factor either out into a shared library or replace them with `@herald/addon` calls.
3. **No Turbo.** There is no `turbo.json` here and there should not be. Three workers don't form a build graph; `pnpm -r run build` is enough.
4. **No hand-rolled cryptographic primitives.** Ed25519 verification, JWT parsing, signature checks: use `@noble/*` or another vetted library. If a primitive is missing, install one.
5. **Never log secrets.** `auth/` handles JWTs and KV values. JWTs and KV contents must not appear in `console.log` / `console.error` / response bodies. The site worker reads `SOLANA_ADDRESS`, a public wallet address that is allowed to be logged or returned in 402 responses (the spec requires it in the response). If you need a debug shortcut, gate it behind `DEBUG === '1'` and remove before merging.
6. **No secrets in commits.** No `.env`, `.dev.vars`, `wrangler-account.json`, anything matching `*-secret*` or `*-private*.{json,pem,key}`.
7. **The auth worker's 55 Vitest tests are a contract.** Don't break them. If you add behavior, add tests; if you change behavior, update the relevant test and explain in the PR.

---

## Spec changes: RFC discipline

The specification at [`spec/AGENTS-TXT-STANDARD.md`](spec/AGENTS-TXT-STANDARD.md) is CC0 and load-bearing. Treat it accordingly.

### Editorial changes

Typos, clarifying examples, broken links, formatting, internal cross-references. **Ship in a normal PR.** Mention what you fixed in the description; reviewers will spot-check.

### Structural changes

New directives, schema fields, conformance requirements, version bumps, anything that changes how an implementer parses or validates. **Open the PR with an RFC-style description:**

- **Why**: what problem does this solve? What real adoption pain motivates it?
- **Compat**: does this break existing parsers? If so, what's the mitigation? If not, why not?
- **Migration**: what does a site that already publishes `agents.txt` need to do?
- **Reference impact**: list the files in `mcp/src/` (validators) and `site/public/` (generated examples) that must change in the same PR to stay consistent.

Then **bump the `Version:` line** at the top of the spec when semantics change.

Discussion happens in the PR thread. Maintainer approval requires explicit "RFC accepted" comment before merge.

### Cross-implementation coordination

If your spec change affects parsers in other languages (Python, Go, Rust, etc.), please link the relevant tracking issues in the PR. We don't enforce coordinated releases, but we do try not to surprise other implementers.

---

## Site / worker changes

The reference site is the canonical *demonstration* of the spec. Some specifics:

- `site/public/agents.txt` and `site/public/agents.json` must always validate against the latest published spec. If you change the spec, regenerate or hand-edit these files in the same PR; they're how implementers see the spec applied.
- `site/src/worker.ts` is the reference x402 v2 implementation at `/x402` and the reference MPP implementation at `/mpp`. Keep each handler self-contained and readable. The x402 handler fits on a single screen; the MPP handler is slightly larger because it owns the `mppx` lifecycle (`getMppx(env)` factory + `Mppx.compose(...)(request)` per request), but still belongs in this one file.
- Astro pages in `site/src/pages/` are user-facing content. Push runtime logic into `worker.ts` or a sibling worker; pages stay declarative.
- New demos go in `site/src/pages/demo/<name>.astro`. Static demos: pure Astro / HTML. Interactive demos that need server logic: extend `worker.ts` with a new pathname check.

---

## MCP server changes

Located in `mcp/`. Backward compatibility matters because third-party MCP clients may already be calling the existing tools.

- **New tools** are additive; ship freely.
- **Existing tool signatures** (`get_spec`, `parse_agents_txt`, `validate_agents_txt`, `validate_agents_json`, `check_site`, `get_skill`) **must not break.** If a tool needs to change in a way that's not backward-compatible, version it (`get_spec_v2`).
- After a spec change, update `validate_agents_txt` / `validate_agents_json` to match. Exercise the validators by pointing them at `site/public/agents.txt` and `agents.json`.

Local exercise:

```bash
pnpm mcp:dev
# In another terminal, point mcp-inspector or Claude Desktop at http://localhost:8787/mcp
```

---

## Agent-auth worker changes

Located in `auth/`. Cryptographic surface; extra discipline applies.

- **Vitest tests are the contract.** `pnpm auth:test` must end at 55 or more passing tests, never fewer. New behavior → new tests. Changed behavior → updated tests with a comment explaining what changed.
- **Use `@noble/*` for all crypto.** No hand-rolled curve math, hash functions, or signature verification. If a primitive isn't available in the libraries already in use, install a vetted one rather than implementing.
- **Never log JWT bodies, KV values, or anything that could contain agent secrets.**
- New endpoints must be advertised in `/.well-known/agent-configuration` so agents can discover them.
- New scopes go through `agents.txt`-spec discussion (they're the agent-side contract surface).

Local exercise:

```bash
pnpm auth:dev
# Test endpoints with curl + wrangler tail; reference auth/test/ for example payloads
```

---

## PR conventions

The [PR template](.github/PULL_REQUEST_TEMPLATE.md) is required. Specifically:

- **Thinking path**: five to eight steps, blockquote style, traces from "agents-txt is X" down to "this PR does Y."
- **Type of change**: tick the right bucket. If a PR touches multiple buckets, split it.
- **Verification**: concrete commands and expected output. For spec PRs, the live `agents-txt.com` URLs that exercise the change. For worker PRs, `wrangler dev` exercise notes.
- **Risks**: even if "Low risk."
- **Spec impact**: required for structural spec changes. Backwards-compat / migration / version bump / mirrored validator updates.
- **Model used**: be specific: provider, model ID/version, thinking mode if applicable. "Claude" is not enough; "claude-opus-4-7 in extended thinking mode" is.
- **Checklist**: tick the boxes you've actually completed. Reviewers check.

### Commit messages

No imposed format. The PR title and body carry the meaning; commit messages can be brief.

### Branches

Branch off `main`. Name branches whatever you want; we squash on merge.

---

## Reporting bugs

Open a GitHub issue. Include:

- Surface (`spec`, `site`, `mcp`, `auth`)
- A reproduction or failing case
- Full stack trace / wrangler tail output if applicable
- What you expected versus what happened

For spec ambiguities, paste the section of the spec that's unclear plus your interpretation. The fix may be a clarifying example rather than a semantic change.

---

## License

- **Specification** (`spec/AGENTS-TXT-STANDARD.md`): contributions are licensed under **CC0** (public domain). By submitting a spec change you waive any claim to it.
- **Reference workers and site** (`site/`, `mcp/`, `auth/`, `landingpage/`): contributions are licensed under **Apache 2.0**, the same license as the rest of the operational code.

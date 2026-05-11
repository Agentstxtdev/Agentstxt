## Thinking Path

<!--
  Required. Trace your reasoning from the top of the project down to this
  specific change. Start with what agentstxt is, then narrow through the
  surface (spec / site / mcp / auth / landingpage), the problem, and why
  this PR exists. Use blockquote style. Aim for 5–8 steps.
  See CONTRIBUTING.md for full examples.
-->

> - agentstxt is the `agents.txt` open standard plus its reference deployment
> - [Which surface — spec/AGENTS-TXT-STANDARD.md / site/ / mcp/ / auth/ / landingpage/]
> - [What problem or gap exists]
> - [Why it needs to be addressed]
> - This pull request ...
> - The benefit is ...

## What Changed

<!-- Bullet list of concrete changes. One bullet per logical unit. -->

-

## Type of change

<!--
  Tick the one that fits. If multiple, separate the changes into distinct PRs
  when possible.
-->

- [ ] **Spec — editorial** (typos, clarifying examples, broken links, formatting). No semantics change.
- [ ] **Spec — structural** (new directives, schema fields, conformance shifts, version bump). RFC discussion required in this PR's description.
- [ ] **Site** (`agentstxt/site/`) — Astro pages, BFF / `/x402` worker, content updates, demo pages.
- [ ] **MCP** (`agentstxt/mcp/`) — new tool, validator improvement, transport fix.
- [ ] **Auth** (`agentstxt/auth/`) — capability extension, scope improvement, key handling.
- [ ] **Landingpage** (`agentstxt/landingpage/`).
- [ ] **Skills / docs / CI / repo plumbing.**

## Verification

<!--
  How can a reviewer confirm this works? Include test commands, manual
  steps, or both. Examples per surface:
    Spec:     re-validate the live `agents.txt` and `agents.json` at agentstxt.dev
    Site:     `pnpm site:build`, screenshots of any UI change
    MCP:      `pnpm mcp:dev`, exercise the new tool from mcp-inspector / Claude Desktop
    Auth:     `pnpm auth:test` (must end at the same or higher number of tests passing)
              + manual `wrangler dev` exercise of the changed endpoint
-->

-

## Risks

<!--
  What could go wrong? Spec changes affect every implementer in the ecosystem.
  Site / worker changes can break a live deployment. Auth changes can leak
  secrets if mis-handled. List concrete risks or "Low risk" if genuinely
  minor.
-->

-

## Spec impact

<!--
  Required if you ticked "Spec — structural" above. Otherwise leave as-is.
  - Backwards-compatible? (will existing parsers still work)
  - Migration story for sites that already publish agents.txt / agents.json
  - Bumped `Version:` line? (yes / no)
  - Mirrored the change into `mcp/src/` validators and `site/public/agents.json`?
-->

- N/A or:
  -

## Model Used

<!--
  Required. Specify which AI model was used to produce or assist with
  this change. Be as descriptive as possible — include:
    • Provider and model name (e.g., Claude, GPT, Gemini, Codex)
    • Exact model ID or version (e.g., claude-opus-4-7, gpt-5)
    • Reasoning/thinking mode if applicable (e.g., extended thinking)
    • Any other relevant capability details (e.g., tool use, code execution)
  If no AI model was used, write "None — human-authored".
-->

-

## Checklist

- [ ] Thinking path traces from project context to this change
- [ ] Model used is specified (with version and capability details)
- [ ] Type-of-change is correctly ticked
- [ ] For spec PRs: RFC-style summary included (Why / Compat / Migration)
- [ ] `pnpm build` runs cleanly across affected sub-packages
- [ ] `pnpm auth:test` is green (only required if `auth/` changed; must not regress test count)
- [ ] No `@agentify/*` import added to any file in this repo
- [ ] No coupling introduced between `site/`, `mcp/`, `auth/` (they stay independent)
- [ ] If spec changed: validators in `mcp/src/` and `site/public/agents.json` updated to match
- [ ] No `console.log` debugging left behind
- [ ] No secrets, wallet keys, JWTs, KV values, or `.env` files committed
- [ ] I will address all reviewer comments before requesting merge

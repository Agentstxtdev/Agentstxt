# Shared `agents.json` fixture corpus

This directory is the canonical fixture corpus exercised by the cross-validator agreement tests in both `@agentstxtdev/herald-schema` (this package) and the agentstxt MCP worker.

Each fixture is a standalone `agents.json` candidate. Filename prefix encodes the expected validity verdict:

- `valid-*.json`: every validator MUST accept (`safeParse.success === true`, no `'fail'` results from `validateAgentsJson`, `validate_agents_json.valid === true`)
- `invalid-*.json`: every validator MUST reject (the inverse)

## Scope

The corpus is restricted to cases where all three validators agree on the binary pass/fail verdict. Disagreement zones (where one validator errors while another only warns) are deliberately excluded so the agreement check stays meaningful. Known disagreement zones, kept out of this corpus:

- Missing `$schema` (Zod accepts, herald-core warns, MCP worker warns).
- Missing top-level `version` / `standard` (Zod rejects, the others warn).
- `mcp[].type` other than `"streamable-http"` (Zod rejects strict literal, the others warn).
- Unknown payment-protocol names without the `x-` prefix (Zod rejects pattern, herald-core warns).
- Non-`https://` but parseable URLs (Zod accepts http(s) via regex, herald-core accepts any parseable URL with a non-https warning, MCP worker rejects non-https).
- `payments.x402.chains: []` (Zod rejects `min(1)`, herald-core does not check).

When the wire schema changes and a fixture's verdict shifts, BOTH copies of this corpus must be updated. A sync check at `pnpm sync-check:fixtures` (in the herald root) asserts byte-equality between this directory and `agentstxt/app/mcp/src/__tests__/fixtures/`.

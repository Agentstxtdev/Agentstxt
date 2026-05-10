# agents.txt Standard — v1.0-draft

**Status:** Draft  
**Version:** 1.0-draft  
**Authors:** Open Agentic Web contributors  
**Repository:** https://github.com/agentstxt/agents.txt  
**License:** CC0 (spec), Apache 2.0 (reference implementation)

---

## Abstract

`agents.txt` (with companion `agents.json`) is a **lightweight, protocol-agnostic capability declaration format** that publicly announces what agent-interaction protocols and features a website supports.

It fills **Layer 4** of the agent-readiness stack:

```
Layer 1 — ACCESS CONTROL      /robots.txt  (RFC 9309)
Layer 2 — PAGE INVENTORY       /sitemap.xml (sitemaps.org)
Layer 3 — CONTENT CURATION     /llms.txt    (llmstxt.org)
Layer 4 — AGENT CAPABILITIES   /agents.txt  (this spec)
```

The existing layers handle access policies, page indexes, and content guidance for LLMs. None of them declare what an AI agent can *do* on a site: pay for content, authenticate, or use an API. `agents.txt` fills that gap with the minimum viable signal.

**Design principle:** `agents.txt` is the announcement layer. It tells an agent which protocols a site speaks. The implementation details always live in the protocol's own layer: 402 response bodies for payment protocols, `/.well-known/agent-configuration` for authorization protocols. Nothing in `agents.txt` duplicates those details.

Its companion, `agents.json`, is the structured catalog layer: where `agents.txt` carries the minimum viable signal, `agents.json` aggregates all declared capabilities into a single machine-readable document with richer detail: pricing, chain identifiers, transport types, and capability descriptions. The relationship mirrors `llms.txt` and `llms-full.txt`: a terse plain-text signal file paired with a comprehensive structured companion. Sites SHOULD serve both; §10 defines the full schema.

A live reference deployment of this specification is available at `https://agentstxt.dev`.

---

## 1. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

---

## 2. Motivation

AI agents are increasingly capable of taking action, not just reading. A site that supports agent payments or agent authentication needs a machine-readable way to advertise those capabilities. Without a standard, agents must probe blindly, guessing from 402 responses, trying well-known paths speculatively, or relying on out-of-band documentation.

`agents.txt` provides a single, discoverable file where a site declares all its agent-interaction capabilities. Each capability block is independent and self-contained. New capability blocks are added as the agent web matures; old parsers silently ignore blocks they do not understand.

Unlike access-control mechanisms that are purely restrictive, `agents.txt` offers agents a positive incentive to comply: structured discovery of MCP endpoints, skill packages, payment protocols, and authentication flows is faster and more reliable than speculative probing or HTML scraping. Sites gain agent-accessible services; agents gain the structure they need to act efficiently. This positive-sum design is why compliance is self-reinforcing: the same dynamic that sustained `robots.txt` across three decades of web evolution.

---

## 3. File Format

`agents.txt` MUST be encoded as UTF-8 ([RFC3629]). A UTF-8 byte order mark (U+FEFF) SHOULD NOT be included; parsers MAY ignore it if present.

`agents.txt` is a plain-text file with one directive per line. Lines beginning with `#` are comments and are ignored. Unknown keys are also ignored (forward-compatible by design).

Capability blocks are separated by blank lines. Each block begins with a directive that declares the capability type, followed by one or more configuration directives for that block.

**Minimum valid file (no capabilities declared):**

```
# agents.txt
# Standard: https://agentstxt.dev
# JSON: https://example.com/agents.json
```

The `# JSON:` line is an optional comment that points agents to the structured companion file. Parsers silently ignore all comment lines (Section 3.2). Sites SHOULD include it whenever `/agents.json` is served.

**File with payment capabilities:**

```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp
```

**File with authorization capabilities:**

```
# agents.txt
# Standard: https://agentstxt.dev

Authorization: agent-auth
Identity: required
```

**File with both:**

```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp

Authorization: agent-auth
Identity: required
```

**File with all three blocks:**

```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium
```

**File with all four blocks:**

```
# agents.txt
# Standard: https://agentstxt.dev
# JSON: https://example.com/agents.json

Payments: enabled
Protocols: x402, mpp

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium

Skills: https://example.com/.well-known/skills/main.md
Skills: https://example.com/.well-known/skills/premium.md
```

### 3.1 Directives

| Directive | Block | Required | Values | Meaning |
|-----------|-------|----------|--------|---------|
| `Payments:` | Payments | No | `enabled` | Site accepts agent payments via declared protocols |
| `Protocols:` | Payments | When `Payments: enabled` | comma-separated list | Supported payment protocol identifiers |
| `Authorization:` | Authorization | No | comma-separated list | Supported authorization protocol identifiers |
| `Identity:` | Authorization | No | `required` | Agents MUST authenticate before any interaction |
| `MCP:` | MCP | No | URL | One MCP server endpoint; repeat for multiple servers |
| `Skills:` | Skills | No | URL | One skill package URL (SKILL.md or index); repeat for multiple packages |

Both `Protocols:` and `Authorization:` accept comma-separated values, allowing a site to declare simultaneous support for multiple protocol identifiers within the same block. Currently recognized identifiers are defined in §5 and §6 respectively.

### 3.2 Parsing Rules

- Lines starting with `#` are comments and are ignored
- Keys are case-sensitive (use exact capitalisation as shown)
- Values are trimmed of leading/trailing whitespace
- Comma-separated values are trimmed individually
- Unknown keys are ignored (forward-compatible)
- Blank lines between blocks are ignored
- File absent = site does not declare agent interaction capabilities

---

## 4. Discovery

### 4.1 Well-Known Paths

`agents.txt` MUST be served at `<origin>/agents.txt`. `agents.json` SHOULD be served at `<origin>/agents.json`. Agents discover both by appending the path to the site origin.

The root-relative path mirrors the established convention of `/robots.txt` (RFC 9309) and `/llms.txt`, files that operators across all hosting environments (static sites, CDNs, edge runtimes) serve without framework integration. A `/.well-known/` path would require a well-known URI registration per RFC 8615 for no practical benefit, since `agents.txt` is an intentionally public artifact that requires no per-origin configuration to locate.

Agents SHOULD request `/agents.json` first when available. If it returns 404 or is not served, they MAY fall back to parsing `/agents.txt`.

### 4.2 `# JSON:` Comment (Optional)

Sites SHOULD include a `# JSON:` comment in the header of `agents.txt` to point agents directly to the companion file:

```
# agents.txt
# Standard: https://agentstxt.dev
# JSON: https://example.com/agents.json
```

This is a comment and is silently ignored by parsers that do not understand it. It allows agents that prefer structured JSON to find `agents.json` from within `agents.txt` without a separate round-trip.

### 4.3 `robots.txt` Hint (Optional)

Sites MAY include an `Agents-Txt:` directive in `robots.txt` as an optional hint, following the established pattern of the `Sitemap:` directive:

```
Agents-Txt: https://example.com/agents.txt
```

This directive is a non-RFC extension and does not modify the robots.txt specification. It helps agents that parse `robots.txt` discover the agents.txt location without a separate request. Sites SHOULD emit this directive whenever `agents.txt` carries any capability declaration (payments, authorization, MCP, skills, or any future block).

### 4.4 `Content-Signal:` in robots.txt (Optional)

Sites MAY include a `Content-Signal:` directive in `robots.txt` to declare AI content usage preferences (IETF AIPREF draft, CC0):

```
Content-Signal: search=yes, ai-train=no, ai-input=no
```

This is distinct from `agents.txt` and concerns training/indexing preferences, not agent interaction capabilities.

### 4.5 Serving Requirements

Both `agents.txt` and `agents.json` are public discovery artifacts. Servers MUST observe the following HTTP requirements when serving them:

- `agents.txt` MUST be served with `Content-Type: text/plain; charset=utf-8`.
- `agents.json` MUST be served with `Content-Type: application/json`.
- Both files MUST be served with `Access-Control-Allow-Origin: *`. Agent runtimes operating in browser contexts will otherwise be unable to fetch them cross-origin.
- Servers SHOULD include `Cache-Control: public, max-age=3600`. This prevents agents from re-fetching on every request while keeping declared capabilities reasonably fresh. Sites that update capabilities frequently MAY use a shorter `max-age`.

---

## 5. Payment Protocols

This section defines the protocol identifiers currently recognized by the `Protocols:` directive. `agents.txt` carries only the identifier; it does not replicate the protocol's configuration, wallet addresses, pricing, or cryptographic details. Each subsection describes what the identifier signals to an agent and where the agent finds the protocol's own details after reading `agents.txt`. New identifiers may be registered in future spec versions; parsers MUST warn on (not fail for) unrecognized values.

### 5.1 x402 — Per-Request Crypto Micropayments

[x402](https://x402.org) is an HTTP 402-based payment protocol. Agents pay per request using on-chain USDC signatures; the server verifies via a facilitator (no private keys required server-side).

**Discovery:** Advertised in `agents.txt` as `x402`. Payment details (wallet address, chain, amount) are NOT in `agents.txt`; they are in the `402 Payment Required` response body.

**Flow summary:**
```
Agent → GET /api/content
Server ← 402 + { accepts: [{ network, to, maxAmountRequired, asset }] }
Agent → GET /api/content + X-PAYMENT: <base64-proof>
Server ← 200 + X-Payment-Response
```

### 5.2 MPP — Session-Based Fiat + Stablecoin Payments

[MPP (Machine Payments Protocol)](https://mpp.dev) is an IETF draft (`draft-ryan-httpauth-payment`) that uses a challenge/credential flow over standard HTTP `WWW-Authenticate: Payment`. Supports fiat cards (Stripe) and stablecoins (Tempo/USDC). Session-based: agents authorize a budget once, then make multiple requests.

**Discovery:** Advertised in `agents.txt` as `mpp`. Session parameters are NOT in `agents.txt`; they are in the `402 Payment Required` response.

**Flow summary:**
```
Agent → GET /api/content
Server ← 402 + WWW-Authenticate: Payment realm=... challenge=<id>
Agent → [authorize budget via Stripe or Tempo wallet]
Agent → GET /api/content + Authorization: Payment <credential>
Server ← 200 + Payment-Receipt: ...
```

### 5.3 Protocol Selection

Sites SHOULD support both protocols when possible. Agents SHOULD prefer MPP when available (lower per-request latency after first auth; supports fiat). x402 is the fallback for anonymous one-shot payments.

---

## 6. Authorization Protocols

This section defines the protocol identifiers currently recognized by the `Authorization:` directive. As with payment protocols, `agents.txt` names the authorization scheme a site uses; all identity, capability, and credential details remain at the protocol's own discovery endpoint, never in `agents.txt`. New identifiers may be registered in future spec versions.

### 6.1 agent-auth — Agent Auth Protocol

[Agent Auth Protocol](https://agentauthprotocol.com) (v1.0-draft) establishes AI agents as first-class authenticated principals with scoped capability grants. Each agent has a persistent identity, operates under a host, and receives fine-grained grants (with optional constraints) for specific server capabilities.

**Discovery:** Advertised in `agents.txt` as `agent-auth`. Implementation details (capability schemas, endpoint URLs, supported modes, approval flows) are NOT in `agents.txt`. They are served at the protocol's own well-known discovery endpoint:

```
GET /.well-known/agent-configuration
```

This endpoint follows the RFC 8414 authorization server metadata pattern and returns the issuer URL, all agent endpoint paths, supported algorithms (EdDSA/Ed25519), agent modes, and approval methods.

**Two agent modes:**
- `delegated` — agent acts on behalf of a specific user; user consent is required
- `autonomous` — agent operates without per-request user involvement; governed by server policy

**Flow summary:**
```
Agent → GET /.well-known/agent-configuration
Server ← { issuer, endpoints, modes, approval_methods, capabilities }

Agent → POST /agent/register          (host JWT, typ: "host+jwt")
Server ← { agent_id, grants: [...] }  (active or pending)

[if grants pending]
Server ← { approval: { method: "device_authorization", verification_uri } }
User   → approves at verification_uri

Agent → POST /capability/execute      (agent JWT, typ: "agent+jwt", aud = capability URL)
Server ← 200 + capability result
```

Credential and key details (JWKs, capability schemas, endpoint URLs) are NOT in `agents.txt`. They are exchanged via `/.well-known/agent-configuration` and the `/agent/register` flow, as defined by the Agent Auth Protocol specification.

### 6.2 `Identity: required`

When a site emits `Identity: required` in the Authorization block, it signals a site-level policy: agents MUST authenticate before any interaction, not just before capability execution. This is a stronger signal than the protocol's own capability-gating and is intended for sites where unauthenticated agent access is not acceptable under any circumstance.

```
Authorization: agent-auth
Identity: required
```

Absence of `Identity: required` does not mean identity is optional; it means the site defers identity requirements to the protocol layer.

---

## 7. MCP (Model Context Protocol)

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open protocol from Anthropic that enables AI agents to connect to external tools, data sources, and services via a standardized JSON-RPC interface. MCP servers expose **tools** (callable functions), **resources** (readable data), and **prompts** (templated workflows) to any compatible AI host (Claude, Cursor, ChatGPT, etc.).

### 7.1 The Discovery Gap

The MCP spec (2025-03-26+) defines no standard well-known path for server discovery. The MCP endpoint URL is site-specific: it could be `/mcp`, `/api/mcp`, or anything else. The MCP Registry (modelcontextprotocol.io/registry) is a manually curated directory, not something an agent can probe autonomously. Without prior configuration, an agent has no way to know a site has an MCP server.

`agents.txt` fills this gap. The `MCP:` directive is the only machine-readable way for a site to advertise its MCP endpoint URL without requiring an agent to have prior knowledge.

### 7.2 `MCP:` Directive

One `MCP:` line per endpoint. Repeat for multiple servers:

```
MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium
```

Each URL MUST point to a Streamable HTTP MCP endpoint, one that supports both `POST` (for JSON-RPC requests) and `GET` (for SSE streams), as defined by the MCP spec. Endpoints SHOULD use HTTPS.

### 7.3 Authentication

Authentication for MCP endpoints is NOT declared in the `MCP:` block. Two paths:

1. **Site-level agent auth** — if the `Authorization:` block is present (e.g. `Authorization: agent-auth`), agents understand authentication is required before connecting to anything on the site, including MCP endpoints.
2. **MCP-native auth** — if the MCP endpoint has its own OAuth 2.0 protection, the server communicates this at connection time via standard HTTP auth challenges. The agent handles it through the MCP protocol. `agents.txt` is silent on this.

This keeps the blocks independent: adding or removing the `Authorization:` block never requires changing the `MCP:` block, and vice versa.

### 7.4 Transport

The `MCP:` directive is specific to the **Streamable HTTP** transport (MCP spec 2025-03-26+). The `stdio` transport is a local subprocess model and is not relevant to HTTP-based agent discovery.

Sites that also serve the deprecated SSE transport for backwards compatibility with pre-2025-03-26 clients MAY do so at an alternative path. They SHOULD still advertise only the Streamable HTTP endpoint in `agents.txt`: Streamable HTTP supersedes SSE as the interoperability baseline for this spec, and agents that support only SSE are outside its compatibility scope.

---

## 8. Skills (Agent Skills Protocol)

[Agent Skills](https://agentskills.io) is an open standard (originally from Anthropic, now multi-vendor) for packaging reusable instructions for AI agents. A skill is a `SKILL.md` file with `name` + `description` frontmatter and markdown instructions. Adopted by 30+ tools including Claude Code, Cursor, GitHub Copilot, Gemini CLI, Codex, and OpenCode.

### 8.1 Two Kinds of Skills — Why Only One Belongs Here

There are two distinct use cases for skills:

1. **Repo-level developer skills** — stored in `/.claude/skills/`, `AGENTS.md`, or `CLAUDE.md`. These teach agents how to _work on the codebase_ as a developer (run tests, make a PR, follow the branching policy). They live in the repository and are not relevant to agents consuming the site's service.

2. **Service-consumption skills** — published by the site operator to teach agents how to _use the site's service, API, or MCP tools_. These need discovery: an agent fetching your site for the first time has no way to know a skill package exists. `agents.txt` fills this gap.

The `Skills:` directive is for type 2 only. Type 1 skills are a developer-facing artifact and should never be advertised in `agents.txt`.

### 8.2 `Skills:` Directive

One `Skills:` line per skill package URL. Repeat for multiple packages:

```
Skills: https://example.com/.well-known/skills/main.md
Skills: https://example.com/.well-known/skills/premium.md
```

Each URL SHOULD point to a `SKILL.md` file or a skill index following the [agentskills.io](https://agentskills.io) standard. URLs SHOULD use HTTPS.

There is no mandated well-known path for skill packages; the URL is fully site-specific. `agents.txt` is the discovery mechanism.

### 8.3 Skills and Payment

Skill URLs are ordinary HTTP endpoints. A site operator MAY gate a skill URL behind a payment (x402 or MPP). When an agent fetches a gated skill URL and receives a `402 Payment Required` response, it handles payment using the standard payment flow and retries. `agents.txt` does not need to pre-declare whether a skill requires payment; the 402 response carries that signal.

This enables a natural tiering: free skills and premium skills can coexist as separate `Skills:` lines pointing to different endpoints.

### 8.4 Authentication

If skill URLs require authentication, the `Authorization:` block (e.g. `Authorization: agent-auth`) declares the site-level auth requirement. The `Skills:` block itself carries only URLs, with no auth signaling. This keeps the blocks fully independent.

---

## 9. Relationship to Existing Standards

| Standard | Relationship |
|----------|-------------|
| robots.txt (RFC 9309) | Complementary. `robots.txt` controls crawler access; `agents.txt` declares agent capabilities. Sites SHOULD add `Agents-Txt:` as a non-breaking hint whenever `agents.txt` carries any capability. |
| sitemap.xml (sitemaps.org) | Unrelated. `sitemap.xml` is a page index; `agents.txt` declares runtime capabilities. |
| llms.txt (llmstxt.org) | Complementary. `llms.txt` curates content for LLM inference; `agents.txt` declares what agents can do on the site. |
| x402 (x402.org) | `agents.txt` advertises x402 support. The protocol itself (payment details, verification) is defined by x402.org and the `@x402/*` packages. |
| MPP (mpp.dev, IETF draft) | `agents.txt` advertises MPP support. The protocol itself is defined by the IETF draft and the `mppx` SDK. |
| Agent Auth Protocol (agentauthprotocol.com) | `agents.txt` advertises `agent-auth` support. The protocol itself (capability schemas, JWT flows, approval methods) is defined at `/.well-known/agent-configuration` and the Agent Auth Protocol spec. |
| MCP (modelcontextprotocol.io) | `agents.txt` provides MCP endpoint discovery via `MCP:` directives. The MCP spec defines no standard well-known path; `agents.txt` fills this gap. The protocol itself (tools, resources, prompts, auth) is defined by the MCP spec. |
| Agent Skills (agentskills.io) | `agents.txt` provides discovery of service-consumption skill packages via `Skills:` directives. Repo-level developer skills (AGENTS.md, CLAUDE.md, `/.claude/skills/`) are out of scope for `agents.txt`. |
| Cloudflare Pay-per-Crawl | Complementary. This spec is open and self-hosted; Cloudflare's service is proprietary. Both may advertise via `agents.txt` in future. |
| A2A (Agent2Agent Protocol) | Complementary. A2A uses `/.well-known/agent-card.json` as a fixed well-known discovery path; agents that support A2A can probe it directly. `agents.txt` does not duplicate this. Future versions may add an `A2A:` hint block if operator demand emerges. |
| ERC-8004 (Trustless Agents Registry) | Compatible. `agents.txt` operates entirely off-chain. Sites that anchor agent identity on-chain via ERC-8004 remain compatible; this spec imposes no constraint. |

---

## 10. JSON Format (`/agents.json`)

`/agents.json` is a **strongly recommended** structured companion to `/agents.txt`. It is generated from the same config and served at `<origin>/agents.json`. It is not a replacement; `agents.txt` remains the canonical plain-text format. Sites SHOULD serve both; agents that support structured formats SHOULD prefer `agents.json` for its richer detail and machine-parsability.

### 10.1 Why both formats?

`agents.txt` is the announcement layer: minimal, human-friendly, easy to serve anywhere. `agents.json` is the full machine-readable catalog: structured, schema-validatable, and richer per block. The relationship intentionally mirrors `llms.txt` and `llms-full.txt` (a terse signal file paired with a comprehensive structured companion), adapted here for the agent interaction layer rather than content curation. Where `llms-full.txt` expands page content for LLM inference, `agents.json` expands protocol metadata for agent decision-making: pricing, chain identifiers, discovery pointers, and capability descriptions that would be too verbose for a plain-text file.

The key additions agents.json makes over agents.txt:
- **Pricing upfront** — agents can check affordability before making any request.
- **Payment method details** — chains, session budget. Payment method types (Stripe, Lightning, Tempo, etc.) are not listed here; MPP's own 402 challenge advertises them.
- **Authorization discovery pointer** — the `/.well-known/agent-configuration` path, so agents don't need to know the spec.
- **MCP transport type** — always `streamable-http`; clarifies what the endpoint supports.
- **MCP and skill descriptions** — optional human-readable summaries of what each endpoint exposes or teaches, so agents can pre-screen relevance without fetching the resource.
- **Site metadata** — name, url, description from the site config.

### 10.2 Schema

```json
{
  "version": "1.0",
  "standard": "https://agentstxt.dev",
  "site": {
    "name": "My Site",
    "url": "https://example.com",
    "description": "Optional site description"
  },
  "payments": {
    "enabled": true,
    "protocols": ["x402", "mpp"],
    "defaultPrice": { "amount": "0.001", "currency": "USDC" },
    "x402": { "chains": ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] },
    "mpp": { "sessionBudget": "5.00" }
  },
  "authorization": {
    "protocols": ["agent-auth"],
    "identity": "required",
    "discovery": "/.well-known/agent-configuration"
  },
  "mcp": [
    {
      "url": "https://example.com/mcp",
      "type": "streamable-http",
      "description": "Optional: brief description of what this MCP server exposes."
    }
  ],
  "skills": [
    {
      "url": "https://example.com/.well-known/skills/main.md",
      "description": "Optional: brief description of what this skill package teaches."
    },
    { "url": "https://example.com/.well-known/skills/premium.md" }
  ]
}
```

All blocks are optional. A block is omitted entirely when the capability is not configured.

### 10.3 Field notes

**`version`** — the stable semver number of the spec this file was generated against (e.g. `"1.0"`). Pre-release suffixes such as `-draft` are omitted: the `version` field tracks the numeric version only, so agents can parse and compare it without handling arbitrary suffix strings. The value SHOULD match the numeric portion of the spec version declared in the document header.

**`payments.defaultPrice`** — default price for gated resources. Agents use this to pre-screen affordability before making any request. The field uses `amount` (decimal string) and `currency` (token symbol, e.g. `"USDC"`). Wallet addresses are NOT included; they appear only in `402 Payment Required` responses.

**`payments.x402.chains`** — CAIP-2 chain IDs accepted for x402 payments. Agents need this to know if they support the chain before attempting payment. Two formats are used depending on the blockchain:
- **EVM chains** use `eip155:<chainId>`, e.g. `"eip155:8453"` for Base mainnet.
- **Solana networks** use `solana:<genesis-hash>`; the genesis block hash is the canonical CAIP-2 reference for Solana. Known values: mainnet `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"`, devnet `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"`, testnet `"solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z"`.

**`payments.mpp.sessionBudget`** — the maximum amount an agent can authorize per session (decimal string, e.g. `"5.00"`). This is the only MPP field surfaced here. MPP supports many payment methods (Stripe, Lightning, Tempo stablecoins, Solana, Monad, Stellar, RedotPay); the specific methods available are advertised by the server's own `402 WWW-Authenticate: Payment` challenge at request time, not in this discovery file.

**`authorization.discovery`** — always `/.well-known/agent-configuration`. This is the RFC 8414-style discovery endpoint defined by the Agent Auth Protocol. It is hardcoded in the output so agents don't need to know the spec path.

**`mcp[].type`** — always `streamable-http` for HTTP MCP endpoints (MCP spec 2025-03-26+). The value is hardcoded by the generator.

**`mcp[].description`** — OPTIONAL. A brief human-readable summary of what the MCP server exposes (tools, resources, prompts). Agents MAY use this to pre-screen relevance before connecting. This field is `agents.json`-only; `agents.txt` carries only the URL.

**`skills[].description`** — OPTIONAL. A brief human-readable summary of what the skill package teaches agents. Agents MAY use this to pre-screen whether the skill applies to their current task. This field is `agents.json`-only; `agents.txt` carries only the URL.

### 10.4 Security

The same rules as `agents.txt` apply:
- No wallet/treasury addresses; stay in `402` responses only.
- No API keys, Stripe secret keys, JWKs, or credentials of any kind.
- Serve without authentication. It is a public discovery artifact.

---

## 11. Versioning and Extensibility

This spec follows semver. The current version is `v1.0-draft`, the first published release.

**Stability commitment:** The file format, directive names, and `agents.json` schema defined in v1.0 are stable. Breaking changes — removal of a directive, schema field rename, semantics change — require a v2.0. Additive changes (new directives, new protocol identifiers, new `agents.json` fields) are introduced in minor versions and remain backwards-compatible by design.

**Adding new capability blocks:** New protocol authors define a new block-opening directive and register it in a future spec version. Old parsers ignore it automatically.

**Adding new protocol identifiers:** New values for `Protocols:` and `Authorization:` may be defined by protocol authors. Parsers MUST warn on (not fail for) unknown identifiers to ensure forward compatibility.

---

## 12. Security Considerations

- `agents.txt` contains no sensitive data. Do not include wallet addresses, API keys, JWKs, pricing, capability schemas, or any credentials in the file.
- Payment details (wallet address, chain, amount) MUST only appear in `402 Payment Required` responses, never in `agents.txt`.
- Authorization details (JWKs, capability schemas, endpoint URLs) MUST only appear at `/.well-known/agent-configuration` and protocol endpoints, never in `agents.txt`.
- Serve `agents.txt` without authentication. It is a public discovery artifact.

---

## 13. Examples

**Payments only (x402 + MPP):**
```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp
```

**Authorization only (agent-auth, identity required):**
```
# agents.txt
# Standard: https://agentstxt.dev

Authorization: agent-auth
Identity: required
```

**Payments + authorization:**
```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp

Authorization: agent-auth
```

**MCP only:**
```
# agents.txt
# Standard: https://agentstxt.dev

MCP: https://example.com/mcp
```

**Skills only:**
```
# agents.txt
# Standard: https://agentstxt.dev

Skills: https://example.com/.well-known/skills/main.md
```

**Skills with free and paid tiers:**
```
# agents.txt
# Standard: https://agentstxt.dev

Payments: enabled
Protocols: x402, mpp

Skills: https://example.com/.well-known/skills/free.md
Skills: https://example.com/.well-known/skills/premium.md
```

**Full stack (payments + authorization + MCP + skills):**
```
# agents.txt
# Standard: https://agentstxt.dev
# JSON: https://example.com/agents.json

Payments: enabled
Protocols: x402, mpp

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium

Skills: https://example.com/.well-known/skills/main.md
Skills: https://example.com/.well-known/skills/premium.md
```

**No capabilities declared (discovery file only):**
```
# agents.txt
# Standard: https://agentstxt.dev
```

---

## 14. Contributing

See `CONTRIBUTING.md` in the repository. Changes to this spec require a PR with at least two reviewer approvals. The spec is CC0; anyone may implement it without restriction.

---

## 15. References

### Normative

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. <https://www.rfc-editor.org/info/rfc2119>
- **[RFC3629]** Yergeau, F., "UTF-8, a transformation format of ISO 10646", STD 63, RFC 3629, November 2003. <https://www.rfc-editor.org/info/rfc3629>
- **[RFC3986]** Berners-Lee, T., Fielding, R., and Masinter, L., "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. <https://www.rfc-editor.org/info/rfc3986>
- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. <https://www.rfc-editor.org/info/rfc8174>
- **[RFC8259]** Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. <https://www.rfc-editor.org/info/rfc8259>
- **[RFC9110]** Fielding, R., Nottingham, M., and Reschke, J., "HTTP Semantics", STD 97, RFC 9110, June 2022. <https://www.rfc-editor.org/info/rfc9110>
- **[I-D.httpauth-payment]** Ryan, B., "The 'Payment' HTTP Authentication Scheme", draft-ryan-httpauth-payment, January 2026. <https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/>

### Informative

- **[RFC9309]** Koster, M., Illyes, G., Zeller, H., and Whittaker, L., "Robots Exclusion Protocol", RFC 9309, September 2022. <https://www.rfc-editor.org/info/rfc9309>
- **[LLMS-TXT]** "llms.txt — A Proposal to Standardise LLM-Friendly Documentation", 2024. <https://llmstxt.org/>
- **[X402]** Coinbase, "x402: HTTP Payment Protocol", 2025. <https://github.com/coinbase/x402>
- **[MCP]** Anthropic, "Model Context Protocol Specification", 2025. <https://modelcontextprotocol.io/>
- **[A2A]** Google, "Agent2Agent Protocol Specification", 2025. <https://github.com/a2aproject/A2A>
- **[ERC-8004]** "ERC-8004: Trustless Agents Registry", 2025. <https://eips.ethereum.org/EIPS/eip-8004>
- **[AGENT-SKILLS]** "Agent Skills Protocol", 2025. <https://agentskills.io/>

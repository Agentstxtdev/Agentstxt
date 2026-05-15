# agents.txt Standard — v1.0

**Status:** Draft  
**Version:** 1.0  
**Authors:** [hsologarcia](https://github.com/hsologarcia)  
**Contact:** contact@agents-txt.com  
**Published:** 2025-10-13  
**Repository:** [agents-txt/agents-txt](https://github.com/agents-txt/agents-txt)  
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

Its companion, `agents.json`, is the structured catalog layer: where `agents.txt` carries the minimum viable signal, `agents.json` aggregates all declared capabilities into a single machine-readable document with richer detail: pricing, chain identifiers, transport types, and capability descriptions. The relationship mirrors `llms.txt` and `llms-full.txt`: a terse plain-text signal file paired with a comprehensive structured companion. Sites SHOULD serve both; §5 defines the full schema.

A live reference deployment of this specification is available at `https://agents-txt.com`.

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
# Standard: https://agents-txt.com
# JSON: https://example.com/agents.json
```

The `# JSON:` line is an optional comment that points agents to the structured companion file. Parsers silently ignore all comment lines (Section 3.2). Sites SHOULD include it whenever `/agents.json` is served.

**File with payment capabilities:**

```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp
```

**File with authorization capabilities:**

```
# agents.txt
# Standard: https://agents-txt.com

Authorization: agent-auth
Identity: required
```

**File with both:**

```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp

Authorization: agent-auth
Identity: required
```

**File with all three blocks:**

```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp
Payments: required

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium
```

**File with all four blocks:**

```
# agents.txt
# Standard: https://agents-txt.com
# JSON: https://example.com/agents.json

Protocols: x402, mpp

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium

Skills: https://example.com/skills/main/SKILL.md
Skills: https://example.com/skills/premium/SKILL.md
```

### 3.1 Directives

| Directive | Block | Required | Values | Meaning |
|-----------|-------|----------|--------|---------|
| `Protocols:` | Payments | Opens the block | comma-separated list | Supported payment protocol identifiers |
| `Payments:` | Payments | No | `required` | Site-level policy: every interaction requires payment (no free path) |
| `Authorization:` | Authorization | Opens the block | comma-separated list | Supported authorization protocol identifiers |
| `Identity:` | Authorization | No | `required` | Agents MUST authenticate before any interaction |
| `MCP:` | MCP | No | URL | One MCP server endpoint; repeat for multiple servers |
| `Skills:` | Skills | No | URL | One skill package URL (SKILL.md or index); repeat for multiple packages |
| `A2A:` | A2A | No | URL | One A2A AgentCard URL; repeat for multiple agents (§9) |
| `UCP:` | UCP | No | URL | One UCP profile URL; repeat for multiple profiles (§10) |

Registered directives are tracked in §17.2; the live surface at `https://agents-txt.com/registry` carries any additions between spec versions.

Presence of `Protocols:` is the payment-block signal: a site that accepts agent payments declares the protocols it supports and nothing more. `Payments:` is an OPTIONAL site-level policy hint, symmetric with `Identity:` in the Authorization block. Both `Protocols:` and `Authorization:` accept comma-separated values, allowing a site to declare simultaneous support for multiple protocol identifiers within the same block. Currently recognized identifiers are defined in §8 and §11 respectively.

**Experimental identifiers.** A protocol that has not yet been formally registered in this specification MAY be advertised using the `x-` prefix (e.g. `x-mypay`, `x-myauth`). Parsers MUST accept `x-`-prefixed identifiers; validators MUST NOT warn on them. This gives new protocols a runway to be tested in the wild before being promoted to a registered identifier in a future spec version. The same convention applies to per-protocol object keys in `agents.json` (e.g. `payments["x-mypay"]`). Once an identifier is registered in the spec, the `x-` form for the same protocol is retired in favour of the registered name.

### 3.2 Parsing Rules

- Lines starting with `#` are comments and are ignored
- Keys are case-sensitive (use exact capitalisation as shown)
- Values are trimmed of leading/trailing whitespace
- Comma-separated values are trimmed individually
- Unknown keys are ignored (forward-compatible); validators MAY surface them as warnings but MUST NOT treat them as errors
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
# Standard: https://agents-txt.com
# JSON: https://example.com/agents.json
```

This is a comment and is silently ignored by parsers that do not understand it. It allows agents that prefer structured JSON to find `agents.json` from within `agents.txt` without a separate round-trip.

### 4.3 `robots.txt` Discovery

`agents.txt` is discovered through the canonical path defined in §4.1 (`<origin>/agents.txt`). A `robots.txt` written for an agents-compliant site SHOULD include `Allow: /agents.txt` in its default `User-agent: *` block. This both grants explicit access and exposes the file's existence to any crawler reading `robots.txt`:

```
User-agent: *
Allow: /llms.txt
Allow: /agents.txt
Allow: /
```

Implementations MUST NOT emit a separate `Agents-Txt:` directive in `robots.txt`. Earlier drafts of this specification defined such a directive parallel to `Sitemap:`, but because §4.1 fixes the file's location at the canonical path, the directive provided no information beyond what `Allow: /agents.txt` already conveys, and emitting both produces redundant cross-references. The `Sitemap:` directive remains necessary because `sitemap.xml` may legitimately live at any URL; `agents.txt` does not have that flexibility.

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

The mechanism by which a server sets these headers is unspecified. Two patterns satisfy the requirements:

| Pattern | Applies when | Where the headers come from |
|---|---|---|
| Static asset configuration | The route is backed by a file on disk in a static asset root. | A platform-specific configuration file. Common forms: a `_headers` file (Cloudflare, Netlify), a `headers[]` array in `vercel.json` (Vercel), `add_header` directives (nginx), `Header set` (Apache), `header` blocks (Caddy). |
| Dynamic handler | The route is produced by code at request time (a worker, route handler, middleware, edge function). | The handler sets the headers itself before responding. |

A single deployment MAY mix both patterns across different routes. §4.5 governs the headers emitted at request time, not the path that produces them.

The same choice applies to every other discovery surface a deployment serves alongside `agents.txt` and `agents.json`: the AgentCard URL declared by an `A2A:` directive (§9), the agent-configuration document referenced by an `Authorization:` directive (§11), and any future block-level URL. §4.5 does not mandate headers for those paths, but a route backed by a file on disk uses the static asset pipeline, and a route produced by code uses the code that produces it. The static configuration mechanism has no effect on dynamic routes; an entry placed there for a dynamically served path is silently ignored.

#### Reference deployment

The site at `https://agents-txt.com` exercises both patterns within a single deployment. The headers emitted on each agent-facing route are:

| Route | Served as | Headers configured in | Headers emitted |
|---|---|---|---|
| `/agents.txt` | Static file | `_headers` entry | `Content-Type: text/plain; charset=utf-8`<br>`Access-Control-Allow-Origin: *`<br>`Cache-Control: public, max-age=3600` |
| `/agents.json` | Static file | `_headers` entry | `Content-Type: application/json`<br>`Access-Control-Allow-Origin: *`<br>`Cache-Control: public, max-age=3600` |
| `/.well-known/agent-card.json` | Static file | `_headers` entry | `Content-Type: application/json`<br>`Access-Control-Allow-Origin: *`<br>`Cache-Control: public, max-age=3600` |
| `/.well-known/agent-configuration` | Dynamic handler | Set in code | `Content-Type` and `Access-Control-Allow-Origin: *` set by the handler before responding. No `_headers` entry exists for this path because the static asset pipeline does not run for dynamic routes. |

Three of the four routes share the same `_headers` configuration because they are all served as static files. The fourth is served by a route handler that emits its own response headers; adding an entry for it in `_headers` would have no effect on the response. Inspecting both the `_headers` file and the handler that responds to `/.well-known/agent-configuration` confirms that every agent-facing route in this deployment emits the headers required for cross-origin agent access, regardless of the mechanism used to set them.

---

## 5. JSON Format (`/agents.json`)

`/agents.json` is a **strongly recommended** structured companion to `/agents.txt`. It is generated from the same config and served at `<origin>/agents.json`. It is not a replacement; `agents.txt` remains the canonical plain-text format. Sites SHOULD serve both; agents that support structured formats SHOULD prefer `agents.json` for its richer detail and machine-parsability.

### 5.1 Why both formats?

`agents.txt` is the announcement layer: minimal, human-friendly, easy to serve anywhere. `agents.json` is the full machine-readable catalog: structured, schema-validatable, and richer per block. The relationship intentionally mirrors `llms.txt` and `llms-full.txt` (a terse signal file paired with a comprehensive structured companion), adapted here for the agent interaction layer rather than content curation. Where `llms-full.txt` expands page content for LLM inference, `agents.json` expands protocol metadata for agent decision-making: pricing, chain identifiers, discovery pointers, and capability descriptions that would be too verbose for a plain-text file.

The key additions agents.json makes over agents.txt:
- **Pricing upfront.** Agents can check affordability before making any request.
- **Per-protocol structured detail.** Each payment protocol declares its own nested object inside `payments`, carrying the fields an agent needs to pre-screen support: `x402.chains` (CAIP-2 network identifiers), `mpp.methods` (the configured MPP method set, currently `tempo` and `stripe`). Presence of a per-protocol object IS the support signal; there is no top-level `protocols` array.
- **Authorization discovery pointer.** The `/.well-known/agent-configuration` path, so agents don't need to know the spec.
- **MCP transport type.** Always `streamable-http`; clarifies what the endpoint supports.
- **MCP and skill descriptions.** Optional human-readable summaries of what each endpoint exposes or teaches, so agents can pre-screen relevance without fetching the resource.
- **Site metadata.** Name, url, description from the site config.

Registered per-protocol shapes and top-level array shapes are tracked in §17.3.

### 5.2 Schema

```json
{
  "$schema": "https://agents-txt.com/schema/agents-json/v1.0.json",
  "version": "1.0",
  "standard": "https://agents-txt.com",
  "site": {
    "name": "My Site",
    "url": "https://example.com",
    "description": "Optional site description"
  },
  "payments": {
    "x402": {
      "chains": ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      "description": "Access to premium API endpoints."
    },
    "mpp": {
      "methods": ["tempo", "stripe"],
      "description": "Premium content access."
    },
    "ap2": {
      "presentations": ["sd-jwt-vc"],
      "spec": "https://ap2-protocol.org/specification/v0.1",
      "description": "AP2 mandates accepted alongside x402 settlement."
    },
    "required": false,
    "pricing": { "amount": "0.001", "currency": "USDC" }
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
      "url": "https://example.com/skills/main/SKILL.md",
      "description": "Optional: brief description of what this skill package teaches."
    },
    { "url": "https://example.com/skills/premium/SKILL.md" }
  ],
  "a2a": [
    {
      "url": "https://example.com/.well-known/agent-card.json",
      "description": "Optional: brief description of this agent's capability or role."
    }
  ],
  "ucp": [
    {
      "url": "https://example.com/.well-known/ucp",
      "description": "Optional: brief description of this UCP profile."
    }
  ]
}
```

All blocks are optional. A block is omitted entirely when the capability is not configured. Within `payments`, each per-protocol object (`x402`, `mpp`, and any future protocol) is emitted only when that protocol is actually wired up; the `payments` block itself is present only when at least one per-protocol object is present. Absence of the block means the site does not accept agent payments. There is no top-level `payments.protocols` array: the set of supported protocols is the set of per-protocol keys, and the corresponding `Protocols:` line in `agents.txt` carries the same set as plain text.

Implementations SHOULD include the `$schema` field shown above, pointing at the canonical JSON Schema document for the format version they emit. The schema is descriptive: it duplicates rules already defined in this section and is published so JSON-aware editors and validators can perform inline schema validation and autocomplete on hand-edited files. The canonical document for v1.0 is published at `https://agents-txt.com/schema/agents-json/v1.0.json` as a JSON Schema 2020-12 artefact [JSON-SCHEMA-2020-12]. The `$schema` field has no effect on the wire semantics of any other field.

### 5.3 Field notes

**`$schema`**: OPTIONAL URL pointing to the JSON Schema document that describes this revision of the format. When present, the value SHOULD be the canonical document for the format version emitted: for v1.0, `https://agents-txt.com/schema/agents-json/v1.0.json`, published as a JSON Schema 2020-12 artefact [JSON-SCHEMA-2020-12]. Editors and validators that respect the `$schema` field provide inline validation and autocomplete on hand-edited files; the field exists for that purpose. Implementations MAY reference an equivalent schema hosted elsewhere, provided the document covers the same rules established in this section. Future format versions are published at distinct URLs (`v1.1.json`, `v2.0.json`, etc.); the v1.0 URL is a frozen reference and remains valid for documents conforming to this version.

**`version`**: the stable semver number of the spec this file was generated against (e.g. `"1.0"`). Pre-release suffixes such as `-draft` are omitted: the `version` field tracks the numeric version only, so agents can parse and compare it without handling arbitrary suffix strings. The value SHOULD match the numeric portion of the spec version declared in the document header.

**`payments.required`**: OPTIONAL boolean. When `true`, mirrors the `Payments: required` directive (§8.4): every interaction requires payment, no free path exists. Omit (or `false`) when payments are gated per-endpoint via 402.

**`payments.pricing`**. Default price for gated resources. Agents use this to pre-screen affordability before making any request. The field uses `amount` (decimal string) and `currency` (token symbol, e.g. `"USDC"`). Wallet addresses are NOT included; they appear only in `402 Payment Required` responses.

**`payments.x402.chains`**: CAIP-2 chain IDs accepted for x402 payments. Agents need this to know if they support the chain before attempting payment. Two formats are used depending on the blockchain:
- **EVM chains** use `eip155:<chainId>`, e.g. `"eip155:8453"` for Base mainnet.
- **Solana networks** use `solana:<genesis-hash>`; the genesis block hash is the canonical CAIP-2 reference for Solana. Known values: mainnet `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"`, devnet `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"`, testnet `"solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z"`.

**`payments.mpp.methods`**. OPTIONAL array of MPP method identifiers that the site has wired up. Currently recognised values are `"tempo"` (Tempo USDC stablecoin) and `"stripe"` (Stripe fiat cards, Link, Solana USDC via SPT). The list reflects only configured methods, so an agent without a Tempo wallet learns from this field that Stripe is available before issuing the request and receiving the `402 WWW-Authenticate: Payment` challenge. The challenge remains the authoritative source for per-method parameters (network identifiers, recipient identifiers, currency codes); this field exists solely for pre-screening.

**`payments.x402.description`** and **`payments.mpp.description`**. OPTIONAL human-readable strings describing what the agent is paying for under each protocol (the product, service, or resource the site sells). Agents MAY surface this string to users when requesting payment authorisation. The same string typically appears in the corresponding `402` response too (as `accepts[].extra.description` for x402 v2, or in the MPP `WWW-Authenticate` challenge), but this field exists so an agent can pre-screen the offer before issuing the gated request. The field is plain text; SHOULD be one short sentence.

**`payments.ap2`**. OPTIONAL per-protocol object signalling AP2 mandate support (§8.3). Presence of the key is the support signal; agents.txt carries the identifier in the `Protocols:` line. All fields are OPTIONAL:
- `presentations`: array of Verifiable Digital Credential presentation formats the site accepts for AP2 mandates (e.g. `["sd-jwt-vc"]`). Defined by the AP2 specification; this field exists for pre-screening so agents that hold credentials in one format only learn compatibility before issuing the checkout.
- `spec`: URL pointing to the AP2 specification version the site implements (e.g. `https://ap2-protocol.org/specification/v0.1`). Lets agents pin against the same revision.
- `description`: short human-readable note about what AP2 covers on this site, symmetric with `payments.x402.description` and `payments.mpp.description`.
The block carries no mandate content, no signing keys, and no `CheckoutSignature` material. Those are exchanged during checkout per the AP2 specification.

**`ucp[].url`**. URL of a UCP profile JSON document (typically `/.well-known/ucp`). The set of entries in this array MUST match the set of `UCP:` lines in `agents.txt` (§10).

**`ucp[].description`**. OPTIONAL. A brief human-readable summary of what the UCP profile covers (e.g. "B2C shopping", "B2B procurement"). This field is `agents.json`-only; `agents.txt` carries only the URL. Detailed profile metadata (services, capabilities, payment handlers, signing keys) lives in the UCP profile itself.

**`authorization.discovery`**: always `/.well-known/agent-configuration`. This is the RFC 8414-style discovery endpoint defined by the Agent Auth Protocol. It is hardcoded in the output so agents don't need to know the spec path.

**`mcp[].type`**: always `streamable-http` for HTTP MCP endpoints (MCP spec 2025-03-26+). The value is hardcoded by the generator.

**`mcp[].description`**: OPTIONAL. A brief human-readable summary of what the MCP server exposes (tools, resources, prompts). Agents MAY use this to pre-screen relevance before connecting. This field is `agents.json`-only; `agents.txt` carries only the URL.

**`skills[].description`**: OPTIONAL. A brief human-readable summary of what the skill package teaches agents. Agents MAY use this to pre-screen whether the skill applies to their current task. This field is `agents.json`-only; `agents.txt` carries only the URL.

**`a2a[].url`**: URL of an A2A AgentCard JSON document. The set of entries in this array MUST match the set of `A2A:` lines in `agents.txt` (§9).

**`a2a[].description`**: OPTIONAL. A brief human-readable summary of the agent's capability or role. This field is `agents.json`-only; `agents.txt` carries only the URL. Detailed agent metadata (skills, capabilities, extensions, transport) lives in the AgentCard itself.

### 5.4 Security

The same rules as `agents.txt` apply:
- No wallet/treasury addresses; stay in `402` responses only.
- No API keys, Stripe secret keys, JWKs, or credentials of any kind.
- Serve without authentication. It is a public discovery artifact.

---

## 6. MCP (Model Context Protocol)

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open protocol from Anthropic that enables AI agents to connect to external tools, data sources, and services via a standardized JSON-RPC interface. MCP servers expose **tools** (callable functions), **resources** (readable data), and **prompts** (templated workflows) to any compatible AI host (Claude, Cursor, ChatGPT, etc.).

### 6.1 The Discovery Gap

The MCP spec (2025-03-26+) defines no standard well-known path for server discovery. The MCP endpoint URL is site-specific: it could be `/mcp`, `/api/mcp`, or anything else. The MCP Registry (modelcontextprotocol.io/registry) is a manually curated directory, not something an agent can probe autonomously. Without prior configuration, an agent has no way to know a site has an MCP server.

`agents.txt` fills this gap. The `MCP:` directive is the only machine-readable way for a site to advertise its MCP endpoint URL without requiring an agent to have prior knowledge.

### 6.2 `MCP:` Directive

One `MCP:` line per endpoint. Repeat for multiple servers:

```
MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium
```

Each URL MUST point to a Streamable HTTP MCP endpoint, one that supports both `POST` (for JSON-RPC requests) and `GET` (for SSE streams), as defined by the MCP spec. Endpoints SHOULD use HTTPS.

### 6.3 Authentication

Authentication for MCP endpoints is NOT declared in the `MCP:` block. Two paths:

1. **Site-level agent auth**: if the `Authorization:` block is present (e.g. `Authorization: agent-auth`), agents understand authentication is required before connecting to anything on the site, including MCP endpoints.
2. **MCP-native auth**: if the MCP endpoint has its own OAuth 2.0 protection, the server communicates this at connection time via standard HTTP auth challenges. The agent handles it through the MCP protocol. `agents.txt` is silent on this.

This keeps the blocks independent: adding or removing the `Authorization:` block never requires changing the `MCP:` block, and vice versa.

### 6.4 Transport

The `MCP:` directive is specific to the **Streamable HTTP** transport (MCP spec 2025-03-26+). The `stdio` transport is a local subprocess model and is not relevant to HTTP-based agent discovery.

Sites that also serve the deprecated SSE transport for backwards compatibility with pre-2025-03-26 clients MAY do so at an alternative path. They SHOULD still advertise only the Streamable HTTP endpoint in `agents.txt`: Streamable HTTP supersedes SSE as the interoperability baseline for this spec, and agents that support only SSE are outside its compatibility scope.

### 6.5 Relationship to the MCP Server Card (SEP-2127)

The MCP working group is standardizing a server-side discovery card at `/.well-known/mcp/server-card.json` (SEP-2127, see [`modelcontextprotocol/modelcontextprotocol#2127`](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) that describes a single MCP server's `serverInfo`, transport endpoint, and capability flags (`tools` / `resources` / `prompts`). The card is the MCP-native pre-screening surface: an agent can fetch it to check which capability classes the server supports before opening a session.

The `MCP:` directive and the Server Card sit at different layers and complement each other:

- `agents.txt` `MCP:` is the **cross-protocol** discovery channel. An agent fetching `https://example.com/agents.txt` for the first time, with no prior knowledge that the site has any MCP server, learns the endpoint URL here.
- The Server Card is the **MCP-side** descriptor. An agent that already knows where the endpoint is (because it read `agents.txt`, or because the URL is configured locally) reads the card to decide whether to negotiate a session.

Sites with an MCP server SHOULD publish both. The `MCP:` URL in `agents.txt` and the `transport.endpoint` in the Server Card MUST agree.

---

## 7. Skills (Agent Skills Protocol)

[Agent Skills](https://agentskills.io) is an open standard (originally from Anthropic, now multi-vendor) for packaging reusable instructions for AI agents. A skill is a folder named after the skill (the same name appears in YAML frontmatter as the `name` field) containing a required `SKILL.md` file with `name` and `description` frontmatter plus markdown instructions, and OPTIONALLY a sibling `REFERENCE.md` and any supporting scripts or assets the skill needs. Adopted by 30+ tools including Claude Code, Cursor, GitHub Copilot, Gemini CLI, Codex, and OpenCode.

### 7.1 Two Kinds of Skills — Why Only One Belongs Here

There are two distinct use cases for skills:

1. **Repo-level developer skills**: stored in `/.claude/skills/`, `AGENTS.md`, or `CLAUDE.md`. These teach agents how to _work on the codebase_ as a developer (run tests, make a PR, follow the branching policy). They live in the repository and are not relevant to agents consuming the site's service.

2. **Service-consumption skills**: published by the site operator to teach agents how to _use the site's service, API, or MCP tools_. These need discovery: an agent fetching your site for the first time has no way to know a skill package exists. `agents.txt` fills this gap.

The `Skills:` directive is for type 2 only. Type 1 skills are a developer-facing artifact and should never be advertised in `agents.txt`.

### 7.2 `Skills:` Directive

One `Skills:` line per skill package URL. Repeat for multiple packages:

```
Skills: https://example.com/skills/main/SKILL.md
Skills: https://example.com/skills/premium/SKILL.md
```

Each URL SHOULD point directly to a `SKILL.md` file at the root of an agentskills.io-conformant skill folder. URLs SHOULD use HTTPS. Companion files (`REFERENCE.md`, scripts, assets) live in sibling positions inside the same folder and are discovered by the skill's own internal links once the agent has fetched `SKILL.md`. `agents.txt` does not enumerate them; one `Skills:` line per skill is sufficient.

**The skill package URL is fully site-specific.** This specification governs only the discovery directive, not the path where skills are served or the internal layout of a skill package; those are defined by the agentskills.io standard, by individual site operators, or both. The `/skills/<skill-name>/SKILL.md` shape in the examples reflects the canonical agentskills.io layout (folder per skill, named after the skill), but the path is illustrative: sites publish skills at whatever path their content layout prefers, and `agents.txt` is the mechanism that lets agents find them without prior knowledge.

### 7.3 Skills and Payment

Skill URLs are ordinary HTTP endpoints. A site operator MAY gate a skill URL behind a payment (x402 or MPP). When an agent fetches a gated skill URL and receives a `402 Payment Required` response, it handles payment using the standard payment flow and retries. `agents.txt` does not need to pre-declare whether a skill requires payment; the 402 response carries that signal.

This enables a natural tiering: free skills and premium skills can coexist as separate `Skills:` lines pointing to different endpoints.

### 7.4 Authentication

If skill URLs require authentication, the `Authorization:` block (e.g. `Authorization: agent-auth`) declares the site-level auth requirement. The `Skills:` block itself carries only URLs, with no auth signaling. This keeps the blocks fully independent.

### 7.5 Relationship to the Agent Skills Discovery Index (v0.2.0)

The agentskills.io ecosystem defines a complementary discovery index at `/.well-known/agent-skills/index.json` (v0.2.0 schema at `https://schemas.agentskills.io/discovery/0.2.0/schema.json`). The index lists each skill with `name`, `type` (`skill-md` or `archive`), `description`, `url`, and a `digest` of the form `sha256:<hex>`.

The `Skills:` directive and the v0.2.0 index complement each other:

- `agents.txt` `Skills:` is the **format-agnostic** discovery surface. It carries only URLs and works for any agent that can parse the `agents.txt` line format.
- The v0.2.0 index adds **verification metadata** (the sha256 digest) and **artifact typing** (`skill-md` vs `archive`). Skill packagers that need integrity guarantees, or sites that want to advertise bundled archives alongside SKILL.md files, use the index for that.

Both surfaces SHOULD list the same skill set. The `Skills:` URL in `agents.txt` and the `url` field in each `skills[]` entry of the discovery index MUST agree per skill.

---

## 8. Payment Protocols

This section defines the protocol identifiers currently recognized by the `Protocols:` directive. `agents.txt` carries only the identifier; it does not replicate the protocol's configuration, wallet addresses, pricing, or cryptographic details. Each subsection describes what the identifier signals to an agent and where the agent finds the protocol's own details after reading `agents.txt`. New identifiers may be registered in future spec versions; parsers MUST warn on (not fail for) unrecognized values.

### 8.1 x402 — Per-Request Crypto Micropayments

[x402](https://x402.org) is an HTTP 402-based payment protocol. Agents pay per request using on-chain USDC signatures; the server verifies via a facilitator (no private keys required server-side).

**Discovery:** Advertised in `agents.txt` as `x402`. Payment details (wallet address, chain, amount) are NOT in `agents.txt`; they are in the `402 Payment Required` response body.

**Flow summary:**
```
Agent → GET /api/content
Server ← 402 + { accepts: [{ network, to, maxAmountRequired, asset }] }
Agent → GET /api/content + X-PAYMENT: <base64-proof>
Server ← 200 + X-Payment-Response
```

### 8.2 MPP — Session-Based Fiat + Stablecoin Payments

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

### 8.3 ap2 — Agent Payments Protocol (Mandate Layer)

[AP2 (Agent Payments Protocol)](https://ap2-protocol.org) is an open protocol that adds a verifiable mandate layer on top of existing payment rails. AP2 does not move funds; it carries cryptographic proof of user intent (a `CheckoutMandate` bound to the cart state and a `PaymentMandate` carrying the payment authorisation, both expressed as Verifiable Digital Credentials, typically `sd-jwt-vc`). It is designed to compose with A2A, MCP, and UCP, and to sit alongside per-request rails such as x402 or MPP rather than replace them.

**Discovery:** Advertised in `agents.txt` as `ap2`. The accepted mandate presentation formats and the AP2 spec version a site implements are NOT carried in `agents.txt`; they live under `payments.ap2` in `agents.json` (§5.3) and are negotiated in the checkout flow itself per the AP2 specification.

**Composition:** A site that accepts AP2 mandates typically also declares the underlying rail it settles on (`x402`, `mpp`, or a UCP payment handler). AP2 is the trust layer; the rail handles fund movement. The two declarations are independent: a `Protocols:` line may list `x402, ap2` to signal "x402 rail with AP2 mandates", or `mpp, ap2` for "MPP rail with AP2 mandates".

**Flow summary (informative):**
```
Agent → POST /checkout-sessions (AP2 activated)
Server ← { checkoutSignature, supportedPresentations: ["sd-jwt-vc"] }
Agent → [obtain user consent; build CheckoutMandate + PaymentMandate VDCs]
Agent → POST /checkout/complete + { CheckoutMandate, PaymentMandate }
Server ← verifies CheckoutMandate; PSP verifies PaymentMandate; 200 on success
```

The full protocol, mandate schemas, and verification rules are defined by the AP2 specification.

### 8.4 `Payments: required`

When a site emits `Payments: required` in the Payments block, it signals a site-level policy: every interaction requires payment, and no free path exists. Absent this directive, payments are presumed to be gated per-endpoint via 402 responses and free paths may exist.

```
Protocols: x402, mpp
Payments: required
```

This is symmetric with `Identity: required` in the Authorization block (§11.2): both convey site-wide policy beyond what the protocol's own per-request mechanism conveys.

### 8.5 Protocol Selection

Sites SHOULD support more than one protocol when possible. Agents SHOULD prefer MPP when available (lower per-request latency after first auth; supports fiat). x402 is the fallback for anonymous one-shot payments. AP2 is a mandate layer that composes with either rail; sites that need non-repudiable proof of user intent declare it alongside the rail they settle on.

---

## 9. A2A (Agent2Agent Protocol)

[A2A](https://a2a-protocol.org) is an open protocol for agent-to-agent interoperability. An A2A-capable endpoint publishes an **AgentCard** describing its identity, capabilities, transport, and any protocol extensions it supports (for example, the [x402 payments extension](https://github.com/google-agentic-commerce/a2a-x402) for on-chain monetisation).

### 9.1 The Discovery Gap

A2A specifies a canonical well-known path for a *single* agent at the origin: `<origin>/.well-known/agent-card.json`. Two cases fall outside that single canonical path:

1. **Multiple agents on one origin.** A site that operates more than one A2A agent needs a way to point clients at each AgentCard URL.
2. **Non-canonical hosting.** A site may serve its AgentCard at a path other than the well-known default (e.g. `/agents/sales/card.json`).

The `A2A:` directive fills both gaps in the same way `MCP:` fills the discovery gap for MCP endpoints.

### 9.2 `A2A:` Directive

```
A2A: https://example.com/.well-known/agent-card.json
A2A: https://example.com/agents/support/card.json
```

Each `A2A:` line declares the URL of one AgentCard. The directive is repeatable; sites with multiple agents emit one line per agent. The value MUST be an HTTPS URL pointing to a valid AgentCard JSON document.

The block carries URLs only. Everything else (agent name, capabilities, supported extensions such as x402 and AP2, transport, skills, security schemes) lives in the AgentCard itself, exactly as A2A specifies. `agents.txt` does not duplicate or summarise AgentCard fields.

### 9.3 Discovery Precedence

The `A2A:` directive complements, rather than replaces, the canonical well-known path. Clients that already probe `/.well-known/agent-card.json` directly continue to work for sites with a single agent at the default path. `agents.txt` exists so that clients without that knowledge, or sites with multiple or relocated agents, can still discover every AgentCard the site publishes.

### 9.4 Payments and Authentication

`agents.txt` is silent on per-agent payment or authentication configuration: each AgentCard already declares its own `capabilities.extensions` (including the x402 extension if applicable) and its own `securitySchemes`. The site-level `Payments:` and `Authorization:` blocks in `agents.txt` describe site-wide policy and remain independent of the `A2A:` block.

---

## 10. UCP (Universal Commerce Protocol)

[UCP](https://ucp.dev) is an open A2P (agent-to-platform) protocol for commerce capabilities: checkout, cart, catalog, order, fulfillment, identity linking, and the AP2 mandate extension. A UCP-capable business publishes a **profile** at `<origin>/.well-known/ucp` declaring which services it supports, which transport bindings (REST, MCP, A2A, Embedded) it serves them over, and which payment handlers it accepts. Platforms (apps, agents, procurement systems) advertise their own profile via a `UCP-Agent` request header and negotiate the active capability set per session.

### 10.1 The Discovery Gap

UCP specifies a canonical well-known path for a *single* profile at the origin: `<origin>/.well-known/ucp`. Two cases fall outside that single canonical path:

1. **Multiple UCP profiles on one origin.** A business that serves more than one commerce profile (for example, a B2C profile and a B2B profile under the same domain) needs a way to point platforms at each profile URL.
2. **Non-canonical hosting.** A site may serve its UCP profile at a path other than the well-known default (e.g. `/commerce/profile.json`).

The `UCP:` directive fills both gaps, mirroring the way `A2A:` (§9) handles AgentCard discovery.

### 10.2 `UCP:` Directive

```
UCP: https://example.com/.well-known/ucp
UCP: https://example.com/profiles/b2b.json
```

Each `UCP:` line declares the URL of one UCP profile. The directive is repeatable; sites with multiple profiles emit one line per profile. The value MUST be an HTTPS URL pointing to a valid UCP profile JSON document.

The block carries URLs only. Everything else (declared services, capabilities, extensions including [AP2 mandates](https://ucp.dev/documentation/ucp-and-ap2/), supported transport bindings, payment handlers, signing keys) lives in the UCP profile itself, exactly as UCP specifies. `agents.txt` does not duplicate or summarise profile fields.

### 10.3 Discovery Precedence

The `UCP:` directive complements, rather than replaces, the canonical well-known path. Clients that already probe `/.well-known/ucp` directly continue to work for sites with a single profile at the default path. `agents.txt` exists so that clients without that knowledge, or sites with multiple or relocated profiles, can still discover every UCP profile the site publishes.

### 10.4 Payments and Authentication

`agents.txt` is silent on per-profile payment or authentication configuration: each UCP profile already declares its own `payment_handlers`, capabilities, and signing keys, and clients verify via HTTP Message Signatures or any other mechanism UCP defines. The site-level `Protocols:` and `Authorization:` blocks in `agents.txt` describe site-wide policy for the rails declared there and remain independent of the `UCP:` block.

---

## 11. Authorization Protocols

This section defines the protocol identifiers currently recognized by the `Authorization:` directive. As with payment protocols, `agents.txt` names the authorization scheme a site uses; all identity, capability, and credential details remain at the protocol's own discovery endpoint, never in `agents.txt`. New identifiers may be registered in future spec versions.

### 11.1 agent-auth — Agent Auth Protocol

[Agent Auth Protocol](https://agentauthprotocol.com) (v1.0-draft) establishes AI agents as first-class authenticated principals with scoped capability grants. Each agent has a persistent identity, operates under a host, and receives fine-grained grants (with optional constraints) for specific server capabilities.

**Discovery:** Advertised in `agents.txt` as `agent-auth`. Implementation details (capability schemas, endpoint URLs, supported modes, approval flows) are NOT in `agents.txt`. They are served at the protocol's own well-known discovery endpoint:

```
GET /.well-known/agent-configuration
```

This endpoint follows the RFC 8414 authorization server metadata pattern and returns the issuer URL, all agent endpoint paths, supported algorithms (EdDSA/Ed25519), agent modes, and approval methods.

**Two agent modes:**
- `delegated`: agent acts on behalf of a specific user; user consent is required
- `autonomous`: agent operates without per-request user involvement; governed by server policy

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

### 11.2 oauth2 — OAuth 2.0

[OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) is the IETF authorization framework that issues access tokens to authenticated clients. The framework defines four grant types; the `oauth2` identifier in `agents.txt` does not constrain which grants a site supports. Sites declare the supported grant types and authentication methods at their discovery endpoint.

**Discovery:** Advertised in `agents.txt` as `oauth2`. Implementation details (issuer URL, token endpoint, supported grant types, signing algorithms, public keys, supported scopes) are NOT in `agents.txt`. They are served at the OAuth-defined well-known paths:

```
GET /.well-known/oauth-authorization-server   (RFC 8414)
GET /.well-known/openid-configuration         (OpenID Connect Discovery 1.0)
GET /.well-known/jwks.json                    (RFC 7517)
```

Sites that protect specific resources additionally publish [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) Protected Resource Metadata so agents can discover which authorization servers issue tokens valid for the resource:

```
GET /.well-known/oauth-protected-resource
```

**Flow summary (client-credentials grant, RFC 6749 §4.4):**
```
Agent → GET /.well-known/oauth-authorization-server
Server ← { issuer, token_endpoint, jwks_uri, grant_types_supported, scopes_supported }

Agent → POST /oauth/token
        Authorization: Basic <base64(client_id:client_secret)>
        Content-Type: application/x-www-form-urlencoded
        grant_type=client_credentials&scope=<requested scopes>
Server ← { access_token: "<JWT>", token_type: "Bearer", expires_in, scope }

Agent → GET /<protected-resource>
        Authorization: Bearer <access_token>
Server ← 200 + resource representation
```

The access token format is implementation-defined; this specification recommends signed JWTs (RFC 7519) verifiable against the published JWKS, so resource servers can validate without a round-trip to the authorization server. The `jwks_uri` in the discovery metadata SHOULD point at a JSON document conforming to RFC 7517 §5.

**Coexistence with agent-auth:** A site MAY advertise both `agent-auth` and `oauth2` in the same `Authorization:` block. The two protocols are independent: agents pick whichever they support. `agent-auth` is keyed by per-agent Ed25519 identity with capability-scoped grants; `oauth2` is keyed by client_id and is scope-based at the resource level. Sites that publish both run both discovery surfaces in parallel and accept either credential at protected routes.

### 11.3 `Identity: required`

When a site emits `Identity: required` in the Authorization block, it signals a site-level policy: agents MUST authenticate before any interaction, not just before capability execution. This is a stronger signal than the protocol's own capability-gating and is intended for sites where unauthenticated agent access is not acceptable under any circumstance.

```
Authorization: agent-auth
Identity: required
```

Absence of `Identity: required` does not mean identity is optional; it means the site defers identity requirements to the protocol layer.

---

## 12. Relationship to Existing Standards

| Standard | Relationship |
|----------|-------------|
| robots.txt (RFC 9309) | Complementary. `robots.txt` controls crawler access; `agents.txt` declares agent capabilities. Sites SHOULD include `Allow: /agents.txt` in the default wildcard block of `robots.txt` (§4.3); no separate discovery directive is needed since the file is at the canonical path. |
| sitemap.xml (sitemaps.org) | Unrelated. `sitemap.xml` is a page index; `agents.txt` declares runtime capabilities. |
| llms.txt (llmstxt.org) | Complementary. `llms.txt` curates content for LLM inference; `agents.txt` declares what agents can do on the site. |
| x402 (x402.org) | `agents.txt` advertises x402 support. The protocol itself (payment details, verification) is defined by x402.org and the `@x402/*` packages. |
| MPP (mpp.dev, IETF draft) | `agents.txt` advertises MPP support. The protocol itself is defined by the IETF draft and the `mppx` SDK. |
| Agent Auth Protocol (agentauthprotocol.com) | `agents.txt` advertises `agent-auth` support. The protocol itself (capability schemas, JWT flows, approval methods) is defined at `/.well-known/agent-configuration` and the Agent Auth Protocol spec. |
| MCP (modelcontextprotocol.io) | `agents.txt` provides MCP endpoint discovery via `MCP:` directives. The MCP spec defines no standard well-known path; `agents.txt` fills this gap. The protocol itself (tools, resources, prompts, auth) is defined by the MCP spec. |
| Agent Skills (agentskills.io) | `agents.txt` provides discovery of service-consumption skill packages via `Skills:` directives. Repo-level developer skills (AGENTS.md, CLAUDE.md, `/.claude/skills/`) are out of scope for `agents.txt`. |
| Cloudflare Pay-per-Crawl | Complementary. This spec is open and self-hosted; Cloudflare's service is proprietary. Both may advertise via `agents.txt` in future. |
| A2A (Agent2Agent Protocol) | `agents.txt` provides AgentCard discovery via `A2A:` directives (§9), covering sites with multiple agents or non-canonical paths. The well-known path `/.well-known/agent-card.json` remains the primary discovery surface for single-agent sites. The protocol itself (AgentCard schema, JSON-RPC transport, extension mechanism including [x402 payments](https://github.com/google-agentic-commerce/a2a-x402)) is defined by the A2A spec. |
| AP2 (Agent Payments Protocol) | `agents.txt` advertises AP2 mandate support via the `ap2` identifier in the `Protocols:` line (§8.3). AP2 is a trust layer carrying signed `CheckoutMandate` and `PaymentMandate` Verifiable Digital Credentials; it composes with x402, MPP, and UCP rather than replacing them. The protocol itself (mandate schemas, presentation formats, verification) is defined by the AP2 specification. |
| UCP (Universal Commerce Protocol) | `agents.txt` provides UCP profile discovery via `UCP:` directives (§10), covering sites with multiple profiles or non-canonical paths. The well-known path `/.well-known/ucp` remains the primary discovery surface for single-profile sites. The protocol itself (service catalogue, capability negotiation, payment handlers, signing keys, AP2 mandate extension) is defined by the UCP specification. |
| ERC-8004 (Trustless Agents Registry) | Compatible. `agents.txt` operates entirely off-chain. Sites that anchor agent identity on-chain via ERC-8004 remain compatible; this spec imposes no constraint. |
| security.txt (RFC 9116) | Independent. `security.txt` is a human-readable vulnerability disclosure channel published at `/.well-known/security.txt`; `agents.txt` is a machine-readable capability declaration. Sites that take agent payments or authentication SHOULD publish both. |
| Link headers (RFC 8288) | Complementary. `Link:` response headers on `/` advertise discovery surfaces (e.g. `Link: </.well-known/api-catalog>; rel="api-catalog"`) at the HTTP layer, before any file is parsed. `agents.txt` declares site capabilities at the file layer. Both surfaces can coexist and point at the same underlying resources; agents that read headers first reach the discovery surface in one round trip, agents that read the file first arrive at the same destination via the `agents.txt` directives. |
| API Catalog (RFC 9727) | Complementary. `/.well-known/api-catalog` returns `application/linkset+json` listing the site's APIs with `service-desc` / `service-doc` link relations. `agents.txt` declares agent-facing capabilities (Payments, Auth, MCP, Skills, A2A, UCP); the API catalog declares the underlying APIs. Sites with both can use API Catalog entries to point agents at the OpenAPI / AsyncAPI / GraphQL spec for each capability. The two formats target different audiences (API consumers vs. agents) but share an "anchor + relation" shape. |
| MCP Server Card (SEP-2127 / [`modelcontextprotocol/modelcontextprotocol#2127`](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) | Complementary. The Server Card at `/.well-known/mcp/server-card.json` describes a single MCP server's `serverInfo`, transport endpoint, and capability flags (`tools` / `resources` / `prompts`). It is the MCP-side discovery card; `agents.txt`'s `MCP:` directive remains the cross-protocol discovery surface that lets agents find the server in the first place. Sites SHOULD publish both: `agents.txt` for ecosystem discovery, the Server Card for MCP-native pre-screening of capabilities before opening a session. |
| Agent Skills Discovery ([agentskills.io](https://agentskills.io) v0.2.0) | Complementary. The discovery index at `/.well-known/agent-skills/index.json` lists skill artifacts with name / type / url / sha256 digest per entry. `agents.txt`'s `Skills:` directive carries only URLs and remains the primary discovery channel; the Skills Discovery index adds verification (sha256) and metadata (type: `skill-md` or `archive`) for skill packagers that need integrity guarantees. Both list the same skill set; the digests in the discovery index let agents detect drift between the advertised artifact and what they fetched. |
| OAuth Protected Resource Metadata (RFC 9728) | Independent. `/.well-known/oauth-protected-resource` declares which OAuth/OIDC authorization servers can issue tokens for the resource and which scopes it accepts. `agents.txt`'s `Authorization:` directive identifies a protocol family (e.g. `agent-auth`, `oauth2`); the OAuth Protected Resource Metadata declares the OAuth-specific binding details. Sites with OAuth-gated APIs SHOULD publish both. |
| Payment Discovery (`x-payment-info` OpenAPI extension, [paymentauth.org draft](https://paymentauth.org/draft-payment-discovery-00.txt)) | Complementary. An OpenAPI document at `/openapi.json` MAY declare payable operations using the `x-payment-info` extension (per-operation offers of `{ intent, method, amount, currency, description }`). `agents.txt` declares which payment protocols the site speaks; the OpenAPI document declares which paths require payment and at what price. The two layers don't overlap: an agent that has read `agents.txt` and knows a site supports MPP still needs the OpenAPI document (or the 402 response itself) to find out which paths are payable and how much each costs. |
| WebMCP ([webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)) | Complementary. WebMCP exposes site-defined tools to in-page AI agents via `navigator.modelContext.registerTool()` calls in the document. `agents.txt`'s `MCP:` directive advertises server-side MCP endpoints; WebMCP advertises browser-context tools. Both can coexist on the same site: server-side MCP for headless agents, WebMCP for agents running inside the browser tab. |
| Markdown for Agents ([Cloudflare convention](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)) | Independent. HTTP content negotiation: requests with `Accept: text/markdown` SHOULD receive a markdown representation with `Content-Type: text/markdown`. `agents.txt` declares capabilities; Markdown for Agents handles content-format negotiation for arbitrary HTML pages. The two are orthogonal and can be applied to the same site without overlap. |

---

## 13. Versioning and Extensibility

This spec follows semver. The current version is `v1.0`, the first published release.

**Stability commitment:** The file format, directive names, and `agents.json` schema defined in v1.0 are stable. Breaking changes (removal of a directive, schema field rename, semantics change) require a v2.0. Additive changes (new directives, new protocol identifiers, new `agents.json` fields) are introduced in minor versions and remain backwards-compatible by design.

**Adding new capability blocks:** New protocol authors define a new block-opening directive and register it in a future spec version. Old parsers ignore it automatically.

**Adding new protocol identifiers:** New values for `Protocols:` and `Authorization:` may be defined by protocol authors. Parsers MUST warn on (not fail for) unknown identifiers to ensure forward compatibility.

---

## 14. Security Considerations

- `agents.txt` contains no sensitive data. Do not include wallet addresses, API keys, JWKs, pricing, capability schemas, or any credentials in the file.
- Payment details (wallet address, chain, amount) MUST only appear in `402 Payment Required` responses, never in `agents.txt`.
- Authorization details (JWKs, capability schemas, endpoint URLs) MUST only appear at `/.well-known/agent-configuration` and protocol endpoints, never in `agents.txt`.
- Serve `agents.txt` without authentication. It is a public discovery artifact.

---

## 15. Examples

**Payments only (x402 + MPP):**
```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp
```

**Authorization only (agent-auth, identity required):**
```
# agents.txt
# Standard: https://agents-txt.com

Authorization: agent-auth
Identity: required
```

**Payments + authorization:**
```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp

Authorization: agent-auth
```

**MCP only:**
```
# agents.txt
# Standard: https://agents-txt.com

MCP: https://example.com/mcp
```

**Skills only:**
```
# agents.txt
# Standard: https://agents-txt.com

Skills: https://example.com/skills/main/SKILL.md
```

**Skills with free and paid tiers:**
```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, mpp

Skills: https://example.com/skills/free/SKILL.md
Skills: https://example.com/skills/premium/SKILL.md
```

**A2A only (single AgentCard at the canonical path):**
```
# agents.txt
# Standard: https://agents-txt.com

A2A: https://example.com/.well-known/agent-card.json
```

**A2A with multiple agents (non-canonical paths):**
```
# agents.txt
# Standard: https://agents-txt.com

A2A: https://example.com/.well-known/agent-card.json
A2A: https://example.com/agents/support/card.json
A2A: https://example.com/agents/sales/card.json
```

**UCP only (single profile at the canonical path):**
```
# agents.txt
# Standard: https://agents-txt.com

UCP: https://example.com/.well-known/ucp
```

**UCP with B2C and B2B profiles:**
```
# agents.txt
# Standard: https://agents-txt.com

UCP: https://example.com/.well-known/ucp
UCP: https://example.com/profiles/b2b.json
```

**AP2 mandates over x402 settlement:**
```
# agents.txt
# Standard: https://agents-txt.com

Protocols: x402, ap2
```

**AP2 mandates over MPP settlement:**
```
# agents.txt
# Standard: https://agents-txt.com

Protocols: mpp, ap2
```

**Full stack (payments + authorization + MCP + skills):**
```
# agents.txt
# Standard: https://agents-txt.com
# JSON: https://example.com/agents.json

Protocols: x402, mpp

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium

Skills: https://example.com/skills/main/SKILL.md
Skills: https://example.com/skills/premium/SKILL.md
```

**Everything (all blocks, including A2A, UCP, and AP2 mandates):**
```
# agents.txt
# Standard: https://agents-txt.com
# JSON: https://example.com/agents.json

Protocols: x402, mpp, ap2
Payments: required

Authorization: agent-auth
Identity: required

MCP: https://example.com/mcp
MCP: https://example.com/mcp-premium

Skills: https://example.com/skills/main/SKILL.md
Skills: https://example.com/skills/premium/SKILL.md

A2A: https://example.com/.well-known/agent-card.json
A2A: https://example.com/agents/support/card.json

UCP: https://example.com/.well-known/ucp
UCP: https://example.com/profiles/b2b.json
```

**No capabilities declared (discovery file only):**
```
# agents.txt
# Standard: https://agents-txt.com
```

---

## 16. Contributing

See `CONTRIBUTING.md` in the repository. Changes to this spec require a PR with at least two reviewer approvals. The spec is CC0; anyone may implement it without restriction.

---

## 17. Registries

This section establishes two registries governed by this specification. Both follow the IANA "Specification Required" registration policy ([RFC8126] §4.6) adapted for the spec's GitHub-hosted editorial process.

The live registry surface is maintained at `https://agents-txt.com/registry` and reflects the same entries enumerated below. Where the two disagree, the live surface is authoritative between spec versions; the next spec version absorbs accumulated changes.

A canonical JSON Schema 2020-12 document for the `agents.json` wire format described in §5 is published at `https://agents-txt.com/schema/agents-json/v1.0.json` [JSON-SCHEMA-2020-12]. The document is descriptive: it captures the rules already defined in §5 so JSON-aware editors and validators can perform inline schema validation on `agents.json` files. Implementations referencing the schema via the `$schema` field (§5.3) SHOULD use this URL for v1.0 documents. Future format versions are published at distinct URLs (`v1.1.json`, `v2.0.json`, etc.) so existing references remain valid for documents conforming to their declared version.

### 17.1 Registration Policy

New entries are proposed by opening a PR against [`agents-txt/agents-txt`](https://github.com/agents-txt/agents-txt) that:

1. Adds a row to the relevant registry table in §17.2 or §17.3.
2. Includes the registration template (§17.4) filled in, in the PR description.
3. Links to a public specification document for the proposed entry. The specification need not be IETF-published; a stable URL with a versioned document suffices.
4. Receives two reviewer approvals per `CONTRIBUTING.md`.

Provisional entries (entries whose underlying specification is not yet stable) are advertised in the wild using the `x-` prefix per §3.1 and are not added to the registry. A registration request promotes an `x-`-prefixed identifier to a registered name; the `x-` form is retired on the registration date.

Status values:

- **registered**. The entry is stable, has a published specification, and is recommended for general use.
- **provisional**. The entry is accepted into the registry but its specification is still drafting; implementers should expect change.
- **deprecated**. The entry was registered but has been superseded; parsers MUST continue to accept it for backward compatibility, generators SHOULD NOT emit it.

### 17.2 agents.txt Directives Registry

Governs the directive names that may appear in `agents.txt`. Parsers ignore unknown directives per §3.2; this registry exists so directive authors have a coordination surface, not so parsers gain new failure modes.

| Directive | Block | Role | Value type | Repeatable | Spec § | Status |
|---|---|---|---|---|---|---|
| `Protocols:` | Payments | Block opener | Comma-separated identifier list | No | §3.1, §8 | registered |
| `Payments:` | Payments | Modifier | Enum (`required`) | No | §3.1, §8.4 | registered |
| `Authorization:` | Authorization | Block opener | Comma-separated identifier list | No | §3.1, §11 | registered |
| `Identity:` | Authorization | Modifier | Enum (`required`) | No | §3.1, §11.3 | registered |
| `MCP:` | MCP | Block opener | HTTPS URL | Yes | §3.1, §6 | registered |
| `Skills:` | Skills | Block opener | HTTPS URL | Yes | §3.1, §7 | registered |
| `A2A:` | A2A | Block opener | HTTPS URL | Yes | §3.1, §9 | registered |
| `UCP:` | UCP | Block opener | HTTPS URL | Yes | §3.1, §10 | registered |

### 17.3 agents.json Per-Protocol Shape Registry

Governs the per-protocol object shapes inside `agents.json` `payments.*` and the top-level array shapes for `mcp[]`, `skills[]`, `a2a[]`, `ucp[]`. The `version`, `standard`, `site`, and `authorization` blocks are fixed by §5.2 and are not separately registered.

| Key | Parent | Required fields | Optional fields | Spec § | Status |
|---|---|---|---|---|---|
| `payments.x402` | `payments` | (none) | `chains[]`, `description` | §5.3 | registered |
| `payments.mpp` | `payments` | (none) | `methods[]`, `description` | §5.3 | registered |
| `payments.ap2` | `payments` | (none) | `presentations[]`, `spec`, `description` | §5.3, §8.3 | registered |
| `mcp[]` | top-level | `url`, `type` | `description` | §5.3 | registered |
| `skills[]` | top-level | `url` | `description` | §5.3 | registered |
| `a2a[]` | top-level | `url` | `description` | §5.3, §9 | registered |
| `ucp[]` | top-level | `url` | `description` | §5.3, §10 | registered |

Per-protocol shapes are emitted only when the corresponding identifier is present in the matching `agents.txt` block. Absence of a `payments.<id>` object means the site does not accept that protocol, regardless of whether the identifier is registered.

### 17.4 Registration Template

```
Identifier: <name as it appears in agents.txt or agents.json>
Registry:   <directives | json-shape>
Block:      <Payments | Authorization | MCP | Skills | A2A | UCP | top-level>
Role:       <block opener | modifier | per-protocol shape>
Value type: <for directives only: URL | comma-list | enum>
Repeatable: <for directives only: yes | no>
Spec URL:   <canonical, versioned URL to the specification document>
Contact:    <name + email or GitHub handle of registrant>
Status:     <registered | provisional>
Notes:      <one paragraph: what the entry signals, how it interacts with
            existing blocks, anything implementers should know>
```

### 17.5 Out of Scope

Two adjacent registries are intentionally not established by this specification:

- **Payment protocol identifiers** (the values registered for the `Protocols:` directive) are defined by their own specifications (x402, MPP, AP2) and are enumerated in §8. `agents.txt` does not own a parallel registry; this avoids creating two competing sources of truth for identifiers that already have stable homes.
- **Authorization protocol identifiers** (the values registered for the `Authorization:` directive) are similarly enumerated in §11, with each identifier defined by its own specification (Agent Auth Protocol, OAuth 2.0).

If, in a future version, an identifier is proposed whose underlying protocol has no other stable home, this specification MAY add a third registry to cover it. v1.0 declines to pre-empt that case.

---

## 18. References

### Normative

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. <https://www.rfc-editor.org/info/rfc2119>
- **[RFC3629]** Yergeau, F., "UTF-8, a transformation format of ISO 10646", STD 63, RFC 3629, November 2003. <https://www.rfc-editor.org/info/rfc3629>
- **[RFC3986]** Berners-Lee, T., Fielding, R., and Masinter, L., "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. <https://www.rfc-editor.org/info/rfc3986>
- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. <https://www.rfc-editor.org/info/rfc8174>
- **[RFC8259]** Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. <https://www.rfc-editor.org/info/rfc8259>
- **[RFC9110]** Fielding, R., Nottingham, M., and Reschke, J., "HTTP Semantics", STD 97, RFC 9110, June 2022. <https://www.rfc-editor.org/info/rfc9110>
- **[I-D.httpauth-payment]** Ryan, B., "The 'Payment' HTTP Authentication Scheme", draft-ryan-httpauth-payment, January 2026. <https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/>

### Informative

- **[RFC9116]** Foudil, E. and Shafranovich, Y., "A File Format to Aid in Security Vulnerability Disclosure", RFC 9116, April 2022. <https://www.rfc-editor.org/info/rfc9116>
- **[RFC9309]** Koster, M., Illyes, G., Zeller, H., and Whittaker, L., "Robots Exclusion Protocol", RFC 9309, September 2022. <https://www.rfc-editor.org/info/rfc9309>
- **[LLMS-TXT]** "llms.txt — A Proposal to Standardise LLM-Friendly Documentation", 2024. <https://llmstxt.org/>
- **[X402]** Coinbase, "x402: HTTP Payment Protocol", 2025. <https://github.com/coinbase/x402>
- **[MCP]** Anthropic, "Model Context Protocol Specification", 2025. <https://modelcontextprotocol.io/>
- **[A2A]** Google, "Agent2Agent Protocol Specification", 2025. <https://github.com/a2aproject/A2A>
- **[AP2]** "AP2: Agent Payments Protocol", 2025. <https://ap2-protocol.org/>
- **[UCP]** "UCP: Universal Commerce Protocol", 2025. <https://ucp.dev/>
- **[ERC-8004]** "ERC-8004: Trustless Agents Registry", 2025. <https://eips.ethereum.org/EIPS/eip-8004>
- **[AGENT-SKILLS]** "Agent Skills Protocol", 2025. <https://agentskills.io/>
- **[JSON-SCHEMA-2020-12]** Wright, A., Andrews, H., Hutton, B., and Dennis, G., "JSON Schema: A Media Type for Describing JSON Documents", Internet-Draft draft-bhutton-json-schema-01, June 2022. <https://json-schema.org/draft/2020-12/>

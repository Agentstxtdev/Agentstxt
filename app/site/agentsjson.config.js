// Payments are declared in discovery files only when actually wired. Each
// protocol's presence in `protocols[]` is gated by its own credentials; if no
// credentials are configured, the entire payments block is omitted by the
// generator. No master kill switch needed.
const hasX402 = !!(process.env.EVM_ADDRESS || process.env.SOLANA_ADDRESS)
const hasMppTempo = !!process.env.TREASURY_TEMPO
const hasMppStripe = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_NETWORK_ID)
const hasMpp = hasMppTempo || hasMppStripe

// PoC simplification: single shared price applied to both x402 and mpp. The
// herald generator supports per-protocol pricing (X402Config.pricing and
// MppConfig.pricing each take their own values); this reference deployment
// chooses one value across both rails to keep the demo readable for visitors.
// The on-chain x402 charge and the MPP test charge both clear at this amount.
const DEMO_PRICING = {
  amount: process.env.DEMO_PRICE_AMOUNT ?? '0.01',
  token:  process.env.DEMO_PRICE_TOKEN  ?? 'USDC',
}
const X402_DESCRIPTION = 'Synthetic gated route /x402 demonstrating the x402 v2 wire shape on Solana mainnet. Demo charge only; the spec and docs remain free.'
const MPP_DESCRIPTION  = 'Synthetic gated route /mpp demonstrating the MPP wire shape via mppx. Tempo and (when wired) Stripe SPT. Demo charge only; the spec and docs remain free.'

/** @type {import('@herald/core').AgenticConfig} */
export default {
  site: {
    name: 'agents.txt Standard',
    url: 'https://agentstxt.dev',
    description: 'The open specification for AI agent capability declarations. Layer 4 of the agent-readiness stack.',
  },

  payments: {
    protocols: [
      ...(hasX402 ? ['x402'] : []),
      ...(hasMpp ? ['mpp'] : []),
      'ap2',
    ],
    ...(hasX402 && {
      x402: {
        treasury: {
          ...(process.env.EVM_ADDRESS && {
            evmAddress: process.env.EVM_ADDRESS,
            evmChains: ['eip155:8453'],
          }),
          ...(process.env.SOLANA_ADDRESS && {
            solanaAddress: process.env.SOLANA_ADDRESS,
            solanaNetwork: 'mainnet-beta',
          }),
        },
        pricing: DEMO_PRICING,
        description: X402_DESCRIPTION,
      },
    }),
    ...(hasMpp && {
      mpp: {
        ...(hasMppTempo && { tempoRecipient: process.env.TREASURY_TEMPO }),
        ...(hasMppStripe && {
          stripeSecretKey: process.env.STRIPE_SECRET_KEY,
          stripeNetworkId: process.env.STRIPE_NETWORK_ID,
        }),
        ...(process.env.MPP_SECRET_KEY && { secretKey: process.env.MPP_SECRET_KEY }),
        pricing: DEMO_PRICING,
        description: MPP_DESCRIPTION,
      },
    }),
    // OpenAPI discovery surface (/openapi.json) per the MPP / Payment Discovery
    // draft. Independent of the env-var gate on protocols[] above: the
    // openapi.json file is a discovery surface, so it announces what the
    // /x402 and /mpp routes can do at protocol level. The wire activation gate
    // (whether the route actually settles a payment right now) is the worker's
    // responsibility — it returns 503 endpoint_inactive when secrets are absent.
    openapi: {
      title:   'agents.txt — payable demo routes',
      version: '1.0.0',
      paths: {
        '/x402': {
          summary:     'Synthetic x402 v2 gated route (Solana USDC).',
          description: 'Returns HTTP 402 with x402 v2 accepts on first contact; settles via the public x402.org facilitator after the agent supplies a signed payment payload.',
          // x402 is not in MPP's registered method list, but the offer shape is
          // still useful as a service-desc hint and parses fine.
          offers: [{
            intent:      'charge',
            method:      'x402',
            // 0.01 USDC in atomic 6-decimal units.
            amount:      '10000',
            // USDC SPL mint on Solana mainnet.
            currency:    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            description: 'agents.txt x402 demo charge (0.01 USDC on Solana mainnet).',
          }],
        },
        '/mpp': {
          summary:     'Synthetic MPP gated route (Tempo + Stripe).',
          description: 'Returns HTTP 402 with a WWW-Authenticate: Payment challenge composed by mppx. Each method activates per the credentials configured on the worker.',
          offers: [
            {
              intent:      'charge',
              method:      'tempo',
              // 0.01 USDC.e in atomic 6-decimal units.
              amount:      '10000',
              // USDC.e on Tempo mainnet — matches TEMPO_USDC_E in worker.ts.
              currency:    '0x20c0000000000000000000000000000000000000',
              description: 'agents.txt MPP demo charge (0.01 USDC.e on Tempo mainnet).',
            },
            {
              intent:      'charge',
              method:      'stripe',
              // 0.01 USD in cents (Stripe's smallest unit).
              amount:      '1',
              currency:    'usd',
              description: 'agents.txt MPP demo charge (0.01 USD via Stripe — card or Solana USDC).',
            },
          ],
        },
      },
    },

    // AP2 (Agent Payments Protocol) mandate layer. Spec §5.3. Presence of
    // this object is the announcement signal; the mandate exchange itself
    // (CheckoutMandate, PaymentMandate) happens during checkout per the AP2
    // specification and is not wired on this demo deployment. The fields
    // surface in agents.json so an agent can pre-screen before issuing a
    // checkout request.
    ap2: {
      presentations: ['sd-jwt-vc'],
      spec: 'https://ap2-protocol.org',
      description: 'Reference declaration of AP2 mandate support. Mandate exchange (CheckoutMandate, PaymentMandate) is not wired on this demo deployment; the field exists so an agent can pre-screen the announcement layer end to end.',
    },
  },

  // Opinionated crawler policy:
  //   • Search engines welcome.
  //   • Free AI training scrapers blocked by default — agentstxt.dev is a spec
  //     site and a live demo, not a training corpus. Agents that want access
  //     can pay via x402 / MPP.
  //   • Paid agents (AgentstxtBot) explicitly allowed.
  crawlers: {
    blockFreeAiScrapers: true,
    allowSearchEngines: true,
    allowPaidAgents: true,
  },

  content: {
    driver: {
      type: 'static',
      pages: [],
      sections: [
        {
          name: 'Specification',
          pages: [
            {
              url: 'https://agentstxt.dev',
              title: 'agents.txt Standard v1.0',
              description: 'The open specification for AI agent capability declarations. Covers file format, directives, discovery, payment protocols (x402, MPP), authorization (agent-auth), MCP endpoint declaration, and skills. Layer 4 of the agent-readiness stack.',
            },
            {
              url: 'https://agentstxt.dev/spec',
              title: 'agents.txt Standard v1.0 (full text)',
              description: 'The complete text of the v1.0 specification rendered as a single page: file format, directives, discovery, the agents.json schema, the four capability blocks (Payments, Authorization, MCP, Skills) plus A2A and UCP, §4.5 serving requirements, and the registries defined in §17.',
            },
            {
              url: 'https://agentstxt.dev/registry',
              title: 'agents.txt Registry',
              description: 'Live surface for the two registries defined in §17 of the spec: the directive names registered for use in agents.txt, and the per-protocol object shapes registered for use in agents.json. Authoritative between spec versions; the next spec version absorbs accumulated changes.',
            },
          ],
        },
        {
          name: 'Demos',
          pages: [
            { url: 'https://agentstxt.dev/demo',           title: 'Demos index',                description: 'Live demonstrations of every capability the spec advertises.' },
            { url: 'https://agentstxt.dev/demo/auth',      title: 'Agent Auth demo',            description: '7-step Ed25519 + JWT handshake against the agent-auth Cloudflare Worker.' },
            { url: 'https://agentstxt.dev/demo/mcp',       title: 'MCP demo',                   description: 'Streamable HTTP MCP session: initialize, tools/list, get_spec, validators.' },
            { url: 'https://agentstxt.dev/demo/payments',  title: 'Payments demo',              description: 'Announcement-then-wire walkthrough: reads agents.json, then fetches the synthetic /x402 gated route to show the payTo recipient in a real 402.' },
            { url: 'https://agentstxt.dev/demo/mpp',       title: 'MPP demo',                   description: 'Announcement-then-wire walkthrough: reads agents.json, then probes /mpp for a real 402 + WWW-Authenticate: Payment challenge composed by mppx. Tempo and/or Stripe methods activate per the credentials configured on the worker.' },
            { url: 'https://agentstxt.dev/demo/a2a',       title: 'A2A discovery demo',         description: 'A2A AgentCard discovery flow: reads the A2A: directive from agents.txt and the a2a[] block from agents.json, fetches the declared AgentCard, parses its capabilities and skills, then confirms cross-file consistency via the MCP audit_site tool.' },
            { url: 'https://agentstxt.dev/demo/ucp',       title: 'UCP discovery demo',         description: 'UCP profile discovery flow: reads the UCP: directive from agents.txt and the ucp[] block from agents.json, fetches the declared profile, parses its services / capabilities / payment_handlers (including the AP2 mandate extension) and signing keys, then confirms cross-file consistency via the MCP audit_site tool.' },
            { url: 'https://agentstxt.dev/demo/skills',    title: 'Skills demo',                description: 'agents.json skills index → MCP get_skill → installable skill package.' },
            { url: 'https://agentstxt.dev/demo/llms',      title: 'Discovery & content layers demo',  description: 'Fetches every discovery and content file served by this site: /robots.txt (Layer 1), /sitemap.xml (Layer 2), /llms.txt and /llms-full.txt (Layer 3), plus a §4.5 headers check that confirms /agents.txt and /agents.json serve with the right Content-Type, CORS, and Cache-Control.' },
            { url: 'https://agentstxt.dev/demo/generate',  title: 'File Generator',             description: 'Browser-only configurator that emits agents.txt + agents.json from form input.' },
          ],
        },
      ],
    },
    // Switch to firecrawl once deployed:
    // fullTxt: { driver: { type: 'firecrawl', siteUrl: 'https://agentstxt.dev', apiKey: process.env.FIRECRAWL_API_KEY } },
  },

  authorization: {
    enabled: true,
    // Both protocols are wired in the auth worker. agent-auth (Ed25519 + JWT)
    // is the per-agent identity flow; oauth2 (RFC 6749 §4.4 client-credentials)
    // is the per-client token flow. Agents pick whichever they support. The
    // matching well-known discovery surfaces are served at:
    //   /.well-known/agent-configuration            (agent-auth)
    //   /.well-known/openid-configuration           (oauth2)
    //   /.well-known/oauth-authorization-server     (oauth2 alias)
    //   /.well-known/oauth-protected-resource       (oauth2 RFC 9728)
    //   /.well-known/jwks.json                      (oauth2 public key)
    protocols: ['agent-auth', 'oauth2'],
    identityRequired: false,
  },

  mcp: {
    endpoints: {
      url: 'https://agentstxt.dev/mcp',
      description: 'Exposes the agents.txt spec as structured resources: sections, directive reference, examples, and the JSON schema for agents.json.',
    },
    // SEP-2127 server-card metadata. herald emits
    // /.well-known/mcp/server-card.json describing this MCP server.
    serverCard: {
      name:    'agents.txt',
      version: '0.5.0',
      capabilities: {
        tools:     true,
        resources: false,
        prompts:   false,
      },
    },
  },

  skills: {
    // sha256 of public/skills/adopt-agents-txt/SKILL.md — required by the
    // Cloudflare Agent Skills Discovery v0.2.0 index. Regenerate with
    // `sha256sum public/skills/adopt-agents-txt/SKILL.md` whenever the file
    // changes; herald otherwise omits the entry from the discovery index.
    urls: {
      url: 'https://agentstxt.dev/skills/adopt-agents-txt/SKILL.md',
      name: 'adopt-agents-txt',
      type: 'skill-md',
      digest: 'sha256:28b3b35c5f712e9d46d9e0f80d6dfadeec6dab6036179c292d53a47c15933a4a',
      description: 'Guides a developer through adopting the agents.txt standard on their own website: walks the spec, picks an adoption path (hand-write, generator, or library), and validates the result.',
    },
  },

  // A2A AgentCard discovery (a2a-protocol.org). Spec §9. The AgentCard JSON
  // is served as a static file from public/.well-known/agent-card.json and
  // describes a reference meta-agent (no live JSON-RPC backend; this is a
  // discovery demonstration, not an agent runtime).
  a2a: {
    cards: {
      url: 'https://agentstxt.dev/.well-known/agent-card.json',
      description: 'Reference A2A AgentCard describing a meta-agent that explains the agents.txt spec, validates discovery files, and points clients at the live MCP tools.',
    },
  },

  // UCP profile discovery (ucp.dev). Spec §10. The profile JSON is served as
  // a static file from public/.well-known/ucp and demonstrates the discovery
  // shape: declared services, transport bindings, payment handlers (including
  // the AP2 mandate extension), and signing keys. No live UCP server runs at
  // the declared endpoint; the profile exists as a discovery artifact.
  ucp: {
    profiles: {
      url: 'https://agentstxt.dev/.well-known/ucp',
      description: 'Reference UCP profile demonstrating the discovery shape: declared services, transport bindings, payment handlers including the AP2 mandate extension, and signing keys. No live UCP server runs at the declared endpoint; the profile exists as a discovery artifact.',
    },
  },

  // /.well-known/security.txt (RFC 9116). Vulnerability disclosure channel for
  // the reference deployment: the three Cloudflare workers (site, mcp, auth),
  // the spec site, and the herald SDK. Spec §12 acknowledges security.txt as
  // an independent, complementary standard; the file itself is generated by
  // herald and served as a static asset under public/.well-known/.
  security: {
    contact: 'security@agentstxt.dev',
    policy: 'https://github.com/agentstxtdev/agents.txt/security/policy',
    preferredLanguages: ['en'],
  },

  // Reference-deployment-specific: the canonical JSON Schema for agents.json
  // lives at /schema/agents-json/v<MAJOR>.<MINOR>.json on this site. Every
  // generated agents.json carries `$schema` pointing back here, so editors
  // (VS Code, JetBrains, jq --schema) get free autocomplete + inline
  // validation when an operator hand-edits their agents.json. Long cache:
  // the schema for a given version is immutable; v1.1 ships at a different URL.
  headersExtras: [
    {
      source: '/schema/*',
      headers: [
        { key: 'Content-Type',                value: 'application/json' },
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control',               value: 'public, max-age=86400, immutable' },
      ],
    },
  ],
}

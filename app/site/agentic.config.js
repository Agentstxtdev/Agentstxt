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
    protocols: ['agent-auth'],
    identityRequired: false,
  },

  mcp: {
    endpoints: {
      url: 'https://agentstxt.dev/mcp',
      description: 'Exposes the agents.txt spec as structured resources: sections, directive reference, examples, and the JSON schema for agents.json.',
    },
  },

  skills: {
    urls: {
      url: 'https://agentstxt.dev/skills/adopt-agents-txt/SKILL.md',
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
}

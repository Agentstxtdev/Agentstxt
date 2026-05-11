// Payments are declared in discovery files only when actually wired. Each
// protocol's presence in `protocols[]` is gated by its own credentials; if no
// credentials are configured, the entire payments block is omitted by the
// generator. No master kill switch needed.
const hasX402 = !!(process.env.EVM_ADDRESS || process.env.SOLANA_ADDRESS)
const hasMppTempo = !!process.env.TREASURY_TEMPO
const hasMppStripe = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_NETWORK_ID)
const hasMpp = hasMppTempo || hasMppStripe

/** @type {import('@agentify/core').AgenticConfig} */
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
        ...(process.env.X402_PRICE_AMOUNT && {
          pricing: {
            amount: process.env.X402_PRICE_AMOUNT,
            ...(process.env.X402_PRICE_TOKEN && { token: process.env.X402_PRICE_TOKEN }),
          },
        }),
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
        ...(process.env.MPP_PRICE_AMOUNT && {
          pricing: {
            amount: process.env.MPP_PRICE_AMOUNT,
            ...(process.env.MPP_PRICE_TOKEN && { token: process.env.MPP_PRICE_TOKEN }),
          },
        }),
      },
    }),
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
            { url: 'https://agentstxt.dev/demo/payments',  title: 'Payments demo',              description: 'Live x402 v2 + MPP payment flow against the /donate endpoint.' },
            { url: 'https://agentstxt.dev/demo/skills',    title: 'Skills demo',                description: 'agents.json skills index → MCP get_skill → installable skill package.' },
            { url: 'https://agentstxt.dev/demo/llms',      title: 'Content declarations demo',  description: 'Renders /llms.txt and /llms-full.txt content live from this server.' },
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
}

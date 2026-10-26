// Cloudflare Workers entry point
// Fork-owned: upstream deleted this file when they moved the web deploy off Workers
// (Vercel/ECS entries only). The RigoBlock fork deploys to Cloudflare — restore on syncs.
// Adapted to the current createApp AppConfig: getWebSocketUrl was removed upstream.
import { createApp, ENTRY_GATEWAY_URLS } from 'functions/app'

type Env = {
  ASSETS: { fetch: typeof fetch }
  ENTRY_GATEWAY_API_URL?: string
  EMBED_FRAME_ANCESTORS?: string
}

const app = createApp({
  fetchSpaHtml: (c) => (c.env as Env).ASSETS.fetch(c.req.raw),
  getEntryGatewayUrl: (c, env) => {
    if (env) {
      return ENTRY_GATEWAY_URLS[env]
    }
    return (c.env as Env).ENTRY_GATEWAY_API_URL || ENTRY_GATEWAY_URLS.production
  },
  getTrustedClientIp: (c) => c.req.header('cf-connecting-ip'),
  getEmbedFrameAncestors: (c) => (c.env as Env).EMBED_FRAME_ANCESTORS,
})

export default app

// Cloudflare Workers entry point
import { createApp, ENTRY_GATEWAY_URLS, PRIVY_EW_URLS, WEBSOCKET_URLS } from 'functions/app'

const app = createApp({
  fetchSpaHtml: (c) => c.env.ASSETS.fetch(c.req.raw),
  getEntryGatewayUrl: (c) => c.env?.ENTRY_GATEWAY_API_URL || ENTRY_GATEWAY_URLS.production,
  getPrivyEwUrl: (c) => c.env?.PRIVY_EW_URL || PRIVY_EW_URLS.production,
  getWebSocketUrl: (c) => c.env?.WEBSOCKET_URL || WEBSOCKET_URLS.production,
  getTrustedClientIp: (c) => c.req.header('cf-connecting-ip'),
})

// eslint-disable-next-line import/no-unused-modules
export default app

/**
 * RigoBlock Uniswap API proxy — Cloudflare Worker (reference copy).
 *
 * Multi-tenant reverse proxy in front of Uniswap's backend APIs:
 *   /v2/liquidity/*      -> liquidity.backend-prod.api.uniswap.org
 *   /v2/entry-gateway/*  -> entry-gateway.backend-prod.api.uniswap.org
 *   /v2/img/*            -> coin-images.coingecko.com (token logos for browser color extraction)
 *   /v1/statsig-proxy/*  -> gating.interface.gateway.uniswap.org (Statsig SDK relay)
 *   /v1/amplitude-proxy/*-> metrics.interface.gateway.uniswap.org (analytics relay)
 *   everything else      -> {prefix}.uniswap.org (legacy/production-app traffic)
 *
 * Credentialed CORS: the web app uses upstream's cookie session auth
 * (credentials: 'include'), so responses echo the request Origin and set
 * Access-Control-Allow-Credentials. Backend Set-Cookie headers are rewritten
 * (Domain stripped, SameSite=None; Secure) so the browser accepts them for the
 * rigoblock host. See apps/web/AGENTS.md §Fork-Sync Notes.
 *
 * Rate limiting is done HERE (per-IP sliding window over /v2/*), not by a
 * dashboard WAF rule: a WAF block response is served at the edge before this
 * worker runs and cannot carry custom headers, so a tripped rule surfaces in
 * the browser as a misleading "No Access-Control-Allow-Origin header" CORS
 * error (seen at initial-load bursts). The worker 429 goes through respond(),
 * so it always carries the credentialed CORS headers. If you add a dashboard
 * rule anyway, make sure this limiter stays the primary one (or keep the
 * dashboard threshold well above it) and remember its block response has no CORS.
 *
 * @typedef {Object} Env
 */

// ── In-worker per-IP sliding-window rate limiter ─
// Module scope persists per worker isolate; buckets are pruned on access.
const RATE_LIMIT = { windowMs: 10_000, maxRequests: 200 }
const rateLimitBuckets = new Map() // ip -> timestamps within the current window

function isRateLimited(ip) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT.windowMs
  const stamps = (rateLimitBuckets.get(ip) || []).filter((t) => t > windowStart)
  if (stamps.length >= RATE_LIMIT.maxRequests) {
    rateLimitBuckets.set(ip, stamps)
    return true
  }
  stamps.push(now)
  rateLimitBuckets.set(ip, stamps)
  if (rateLimitBuckets.size > 10_000) {
    for (const [key, arr] of rateLimitBuckets) {
      if (!arr.length || arr[arr.length - 1] < windowStart) {
        rateLimitBuckets.delete(key)
      }
    }
  }
  return false
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const requestOrigin = request.headers.get('Origin')

    // Credentialed CORS: browsers reject '*' when credentials are included,
    // so echo the caller's origin and allow credentials. Requests without an
    // Origin header (server-to-server, curl) keep the old wildcard behavior.
    const applyCors = (h) => {
      if (requestOrigin) {
        h.set('Access-Control-Allow-Origin', requestOrigin)
        h.set('Access-Control-Allow-Credentials', 'true')
        h.set('Vary', 'Origin')
      } else {
        h.set('Access-Control-Allow-Origin', '*')
      }
      return h
    }

    const respond = (body = null, init = {}) => {
      const h = applyCors(new Headers(init.headers))
      h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      // '*' is treated LITERALLY for credentialed requests — reflect the ask instead.
      h.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || '*')
      h.set('Access-Control-Max-Age', '86400')
      return new Response(body, { ...init, headers: h })
    }

    // ── OPTIONS preflight (safe) ─────────────────────
    if (request.method === 'OPTIONS') {
      const acrm = request.headers.get('Access-Control-Request-Method')
      if (acrm && ['GET', 'POST'].includes(acrm.toUpperCase())) {
        return respond(null, { status: 204 })
      }
      return respond('Bad preflight', { status: 400 })
    }

    if (!['GET', 'POST', 'HEAD'].includes(request.method)) {
      return respond('Method Not Allowed', { status: 405 })
    }

    // Rate limit /v2/* API traffic per IP inside the worker (see the note above):
    // the 429 goes through respond(), so it carries credentialed CORS headers
    // instead of the browser-masking "No ACAO header" error an edge WAF rule produces.
    if (url.pathname.startsWith('/v2/')) {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown'
      if (isRateLimited(ip)) {
        return respond('Too Many Requests', { status: 429, headers: { 'Retry-After': '10' } })
      }
    }

    // ── PREFIX ROUTING LOGIC ─────────────────────────
    const getPrefix = (hostname) => {
      const parts = hostname.split('.')
      const idx = parts.indexOf('rigoblock')
      return idx > 0 ? parts.slice(0, idx).join('.') : ''
    }

    // Finalizer for direct-backend branches: credentialed CORS + cookie rewriting.
    // The rewrite is required because the backend sets cookies for its own domain
    // (.uniswap.org) — the browser would reject them on a rigoblock host.
    // SameSite=None; Secure is needed because localhost dev is cross-site.
    // mintDeviceId: if no x-device-id cookie exists yet, mint a stable one so the
    // session flow (InitSession -> Challenge -> Verify) has a device to bind to.
    const finalizeDirect = (response, { mintDeviceId = false } = {}) => {
      const res = new Response(response.body, response)
      applyCors(res.headers)
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : []
      res.headers.delete('Set-Cookie')
      for (const c of setCookies) {
        let cookie = c.replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*SameSite=[^;]*/gi, '')
        cookie += '; SameSite=None; Secure'
        res.headers.append('Set-Cookie', cookie)
      }
      if (mintDeviceId && !/x-device-id=/.test(request.headers.get('Cookie') || '')) {
        res.headers.append('Set-Cookie', `x-device-id=${crypto.randomUUID()}; Path=/; SameSite=None; Secure`)
      }
      return res
    }

    // Statsig SDK relay: the web build's STATSIG_PROXY_URL_OVERRIDE points at
    // beta.gateway.rigoblock.com/v1/statsig-proxy (the same-origin /config path goes
    // through the app worker's BFF instead). Without this route the catch-all
    // misroutes these requests to beta.gateway.uniswap.org (getPrefix() on the
    // gateway hostname), which does not exist -> 502 -> Statsig initialization_failure.
    if (url.pathname.startsWith('/v1/statsig-proxy')) {
      const targetUrl = `https://gating.interface.gateway.uniswap.org${url.pathname}${url.search}`
      const headers = new Headers(request.headers)
      headers.delete('Cookie') // never leak rigoblock session cookies to uniswap infra
      headers.set('host', 'gating.interface.gateway.uniswap.org')
      try {
        const response = await fetch(targetUrl, { method: request.method, headers, body: request.body })
        return finalizeDirect(response)
      } catch (err) {
        console.error(err)
        return respond('Bad Gateway', { status: 502 })
      }
    }

    // Amplitude relay — same misrouting class as statsig (AMPLITUDE_PROXY_URL_OVERRIDE
    // also points at beta.gateway.rigoblock.com/v1/amplitude-proxy).
    if (url.pathname.startsWith('/v1/amplitude-proxy')) {
      const targetUrl = `https://metrics.interface.gateway.uniswap.org${url.pathname}${url.search}`
      const headers = new Headers(request.headers)
      headers.delete('Cookie')
      headers.set('host', 'metrics.interface.gateway.uniswap.org')
      try {
        const response = await fetch(targetUrl, { method: request.method, headers, body: request.body })
        return finalizeDirect(response)
      } catch (err) {
        console.error(err)
        return respond('Bad Gateway', { status: 502 })
      }
    }

    if (url.pathname.startsWith('/v2/liquidity/')) {
      // Strip /v2/liquidity prefix, forward to liquidity backend
      const targetPath = url.pathname.replace('/v2/liquidity', '')
      const targetUrl = `https://liquidity.backend-prod.api.uniswap.org${targetPath}${url.search}`

      const headers = new Headers(request.headers)
      headers.set('host', 'liquidity.backend-prod.api.uniswap.org')
      // x-api-key is already in the request headers from the client

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers,
          body: request.body,
        })
        return finalizeDirect(response)
      } catch (err) {
        console.error(err)
        return respond('Bad Gateway', { status: 502 })
      }
    }

    if (url.pathname.startsWith('/v2/img/')) {
      // Token-logo image proxy for browser color extraction (packages/ui rn-image-colors.web.ts).
      // CoinGecko's CDN serves ACAO:* but its WAF intermittently challenges direct browser
      // bursts with a 403 page that has NO CORS headers — the "temporary" CORS storms in prod.
      // Serving through here makes delivery deterministic. Deliberately NOT finalizeDirect:
      // no cookies are forwarded or set, and the response is anonymously cacheable.
      const targetPath = url.pathname.replace('/v2/img', '')
      const targetUrl = `https://coin-images.coingecko.com${targetPath}${url.search}`
      const headers = new Headers(request.headers)
      headers.delete('Cookie')
      headers.set('host', 'coin-images.coingecko.com')
      try {
        const response = await fetch(targetUrl, { method: request.method, headers })
        const res = new Response(response.body, response)
        applyCors(res.headers)
        res.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
        return res
      } catch (err) {
        console.error(err)
        return respond('Bad Gateway', { status: 502 })
      }
    }

    if (url.pathname.startsWith('/v2/entry-gateway/')) {
      // Strip /v2/entry-gateway prefix, forward to entry-gateway backend
      const targetPath = url.pathname.replace('/v2/entry-gateway', '')
      const targetUrl = `https://entry-gateway.backend-prod.api.uniswap.org${targetPath}${url.search}`

      const headers = new Headers(request.headers)
      headers.set('host', 'entry-gateway.backend-prod.api.uniswap.org')
      headers.set('Origin', 'https://app.uniswap.org')

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers,
          body: request.body,
        })
        // Zerion (the backend's portfolio/chart/activity provider) classifies which
        // addresses it tracks: EOAs and recognized smart-contract wallets (Safe etc.)
        // work; RigoBlock smart-pool vaults return 400 "untrackable wallet address"
        // (Zerion has not added the Rigoblock factory pattern to its wallet registry),
        // and the backend wraps that as HTTP 500 / grpc-status 13. The app then renders
        // "Chart unavailable" (web), hides the chart (mobile), and can trip its outage
        // banner. This mapping is a STOPGAP so the UI shows a truthful empty state
        // instead of an error. It fires ONLY on that specific upstream 500 — the moment
        // Zerion tracks Rigoblock vaults, upstream returns 200 with real data, this block
        // stops matching, and the chart works with NO worker change. After that the block
        // is inert dead code: safe to remove (it was a stopgap until Zerion classified
        // Rigoblock vaults as wallets — contact path in apps/web/AGENTS.md §Fork-Sync Notes),
        // but leaving it in also maps the same Zerion error for any other untrackable
        // address to a clean empty state. All other 500s pass through byte-identical.
        if (response.status === 500) {
          const text = await response.text()
          if (text.includes('untrackable wallet address')) {
            console.error(
              `[gateway] Zerion untrackable wallet address (upstream 500, request-id ${response.headers.get('x-request-id') || 'n/a'}): ${url.pathname}`,
            )
            const empty = new Response('{}', {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Upstream-Status': '500',
                'X-Upstream-Error': 'zerion-untrackable-wallet-address',
              },
            })
            return finalizeDirect(empty, { mintDeviceId: true })
          }
          return finalizeDirect(new Response(text, {
            status: 500,
            statusText: response.statusText,
            headers: {
              'Content-Type': response.headers.get('Content-Type') || 'application/json',
              'X-Upstream-Status': '500',
            },
          }), { mintDeviceId: true })
        }
        // Cookie session auth (x-session-id / x-device-id) lives here.
        return finalizeDirect(response, { mintDeviceId: true })
      } catch (err) {
        // If the upstream fetch throws (network error/timeout), still return CORS headers —
        // otherwise the browser reports a misleading "No ACAO header" CORS error for what is
        // really a backend outage.
        console.error(err)
        return respond('Bad Gateway', { status: 502 })
      }
    }

    const prefix = getPrefix(url.hostname)
    const targetUrl = prefix
      ? `https://${prefix}.uniswap.org${url.pathname}${url.search}`
      : `https://interface.uniswap.org${url.pathname}${url.search}`

    // ── Caching with POST body hash ──────────────────
    // Never serve a cached response to a cookie-bearing request (session cookies
    // must not be shared across users), and key on Origin so the echoed CORS
    // header can't leak across origins.
    const hasCookie = !!request.headers.get('Cookie')
    const cache = caches.default
    let cacheKey = null

    if (!hasCookie) {
      if (request.method === 'POST') {
        const body = await request.clone().text()
        const hash = body
          ? await crypto.subtle
              .digest('SHA-256', new TextEncoder().encode(body))
              .then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''))
          : ''
        cacheKey = new Request(
          url.toString() + (hash ? '?hash=' + hash : '') + (requestOrigin ? '&o=' + requestOrigin : ''),
          request,
        )
      } else {
        cacheKey = new Request(url.toString() + (requestOrigin ? '?o=' + requestOrigin : ''), request)
      }
    }

    let response = cacheKey ? await cache.match(cacheKey) : null

    try {
      if (!response) {
        const fwd = new Request(targetUrl, request)
        const origin = url.hostname.startsWith('liquidity.')
          ? 'https://app.uniswap.org'
          : new URL(targetUrl).origin
        fwd.headers.set('Origin', origin)
        // fwd.headers.set('Referer', 'https://app.uniswap.org/')
        // Inject API key from Cloudflare secret (wrangler secret put UNISWAP_API_KEY)
        // if (env.UNISWAP_API_KEY) {
        //   fwd.headers.set('x-api-key', env.UNISWAP_API_KEY)
        // }
        response = await fetch(fwd)
        // The Cache API only accepts GET/HEAD keys ("Cannot cache response to
        // non-GET request") — cache those, swallow any residual put failure.
        if (cacheKey && request.method !== 'POST' && response.ok) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((err) => console.error('cache put failed:', err)))
        }
      }

      response = new Response(response.body, response)
      response.headers.set('Cache-Control', 'public, max-age=5, s-maxage=5')

      return respond(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (err) {
      console.error(err)
      return respond('Internal Server Error', { status: 500 })
    }
  },
}

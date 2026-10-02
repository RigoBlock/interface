// Request matrix diffed between the Cloudflare Workers origin and the ECS origin.
// `compareHeaders` lists shim-critical headers that MUST match — a diff there is a
// regression. `expectedDivergences` documents diffs observed today (2026-07) that
// are accepted, so the harness stays green against reality and fails only on NEW drift.

export interface ParitySpec {
  name: string
  path: string
  method?: string
  requestHeaders?: Record<string, string>
  body?: string
  compareStatus?: boolean
  compareHeaders?: readonly string[]
  compareBody?: boolean
  /** Diff the build-injected CSP `<meta>` tag per directive. */
  compareMetaCsp?: boolean
  /** Substrings both origins' bodies must contain (structural, build-agnostic). */
  bodyIncludes?: string[]
  expectedDivergences?: Record<string, string>
}

// Frame protection is the security-critical shim — it must be byte-identical.
const FRAME_HEADERS = ['content-security-policy', 'x-frame-options'] as const
const CACHE_HEADERS = ['cache-control', 'content-type', 'vary'] as const

// ECS builds serve assets from the CDN origin (ASSET_BASE_URL), so the vite CSP
// plugin adds that origin to these directives; Workers assets are same-origin.
const CDN_ORIGIN_NOTE = 'ECS adds the CDN origin (ASSET_BASE_URL) via the vite CSP plugin; Workers is same-origin'
const META_CSP_CDN_DIVERGENCES = {
  'meta-csp:script-src': CDN_ORIGIN_NOTE,
  'meta-csp:style-src': CDN_ORIGIN_NOTE,
  'meta-csp:font-src': CDN_ORIGIN_NOTE,
  'meta-csp:img-src': CDN_ORIGIN_NOTE,
  'meta-csp:media-src': CDN_ORIGIN_NOTE,
  'meta-csp:connect-src': CDN_ORIGIN_NOTE,
  'meta-csp:worker-src': CDN_ORIGIN_NOTE,
} as const

export const PARITY_MATRIX: ParitySpec[] = [
  {
    name: 'spa-root',
    path: '/',
    compareHeaders: [...FRAME_HEADERS, ...CACHE_HEADERS, 'x-content-type-options'],
    compareMetaCsp: true,
    expectedDivergences: {
      'cache-control': 'ECS keeps s-maxage/stale-while-revalidate; the CF edge collapses to max-age=0, must-revalidate',
      'content-type': 'ECS appends charset=utf-8',
      vary: 'ECS adds Vary: Accept-Encoding via hono compress()',
      ...META_CSP_CDN_DIVERGENCES,
    },
  },
  {
    name: 'spa-route',
    path: '/swap',
    compareHeaders: [...FRAME_HEADERS, ...CACHE_HEADERS, 'x-content-type-options'],
    compareMetaCsp: true,
    expectedDivergences: {
      'cache-control': 'ECS keeps s-maxage/stale-while-revalidate; the CF edge collapses to max-age=0, must-revalidate',
      'content-type': 'ECS appends charset=utf-8',
      vary: 'ECS adds Vary: Accept-Encoding via hono compress()',
      ...META_CSP_CDN_DIVERGENCES,
    },
  },
  {
    name: 'embed-frame-policy',
    path: '/embed',
    compareHeaders: [...FRAME_HEADERS],
    bodyIncludes: ['<meta'],
    expectedDivergences: {
      // Same-env pairs match (verified on the staging pair). This entry only absorbs
      // cross-env rigs, where dev's http://localhost:* embed ancestor differs.
      'content-security-policy': 'embed policy: dev-only http://localhost:* ancestor delta in cross-env rigs',
    },
  },
  {
    name: 'meta-tag-injection',
    path: '/explore/tokens/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    compareHeaders: [...FRAME_HEADERS],
    // OG/meta injection must happen on both builds.
    bodyIncludes: ['data-rh="true"', 'og:image'],
    expectedDivergences: {
      'content-type': 'ECS appends charset=utf-8',
      vary: 'ECS adds Vary: Accept-Encoding via hono compress()',
    },
  },
  {
    name: 'og-image-route',
    path: '/api/image/tokens/ethereum/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    compareHeaders: [...CACHE_HEADERS],
    expectedDivergences: {
      'cache-control': 'ECS/CDN serves 1yr immutable; the Workers app sets max-age=604800',
      vary: 'ECS adds Vary: Accept-Encoding',
    },
  },
  {
    name: 'apple-app-site-association',
    path: '/.well-known/apple-app-site-association',
    compareHeaders: ['content-type', 'cache-control'],
    expectedDivergences: {
      'content-type': 'ECS sets application/json; the Workers/CF edge omits content-type',
      'cache-control': 'ECS sets max-age=3600; CF edge differs',
    },
  },
  {
    name: 'static-asset-favicon',
    path: '/favicon.ico',
    compareHeaders: [...CACHE_HEADERS],
    expectedDivergences: {
      'cache-control': 'ECS omits the immutable directive the Workers/_headers path sets',
      'content-type': 'ECS serves image/x-icon; the CF edge serves image/vnd.microsoft.icon',
      vary: 'ECS adds Vary: Accept-Encoding',
    },
  },
  {
    name: 'sourcemap-not-served',
    // A .map request must fall through to the SPA shell, never expose the map.
    path: '/assets/does-not-exist.js.map',
    compareStatus: true,
    compareHeaders: ['content-type'],
    expectedDivergences: {
      'content-type': 'ECS appends charset=utf-8',
    },
  },
  {
    name: 'method-post-spa',
    path: '/swap',
    method: 'POST',
    requestHeaders: { 'content-type': 'application/json' },
    body: '{}',
    compareStatus: true,
    expectedDivergences: {
      status: 'Workers returns 405 for non-GET on SPA routes; ECS root.all("*") serves the SPA (200)',
    },
  },
]

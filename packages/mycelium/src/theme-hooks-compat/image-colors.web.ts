// @ts-expect-error: this exists but is untyped — the same deep import the
// legacy `ui/src/utils/colors/platform/rn-image-colors.web.ts` uses so the
// web app never pulls react-native along for the ride.
import { RNImageColors } from 'react-native-image-colors/lib/module/module.web'
import type { ImageColorsConfig, ImageColorsResult } from './image-colors'

export type { ImageColorsConfig, ImageColorsResult } from './image-colors'

// RigoBlock fork: token-logo color extraction loads images cross-origin with
// crossOrigin="anonymous". CoinGecko's CDN serves those images with
// Access-Control-Allow-Origin: *, but its bot/WAF layer intermittently challenges
// bursts of direct browser requests with a 403 page that carries no CORS headers —
// the exact "temporary" CORS storms seen in production. Routing the fetch through
// the RigoBlock gateway proxy (/v2/img/* -> coin-images.coingecko.com, see
// scripts/rigoblock-api-proxy.worker.js) makes delivery deterministic. The proxy
// answers with wildcard CORS and no credentials, so no cookie is involved.
const COINGECKO_IMAGE_HOST = 'https://coin-images.coingecko.com'
// Must match the /v2/img route in scripts/rigoblock-api-proxy.worker.js.
const RIGOBLOCK_IMAGE_PROXY = 'https://interface.gateway.rigoblock.com/v2/img'

function viaRigoblockProxy(imageUrl: string): string {
  return imageUrl.startsWith(`${COINGECKO_IMAGE_HOST}/`)
    ? `${RIGOBLOCK_IMAGE_PROXY}/${imageUrl.slice(COINGECKO_IMAGE_HOST.length + 1)}`
    : imageUrl
}

/** Web leg: react-native-image-colors' web module (canvas-based extraction). */
export function getImageColors(uri: string, config: ImageColorsConfig): Promise<ImageColorsResult> {
  // SAFETY: the deep module is untyped; the result shape is the library's
  // documented per-platform record, read structurally by the shared pipeline.
  return (
    RNImageColors as { getColors: (uri: string, config: ImageColorsConfig) => Promise<ImageColorsResult> }
  ).getColors(viaRigoblockProxy(uri), config)
}

import { getEntryGatewayUrl, provideDeviceIdService, provideSessionStorage } from '@universe/api'
import {
  createRpcConfigResolver,
  createUniRpcConfigResolver,
  type RpcConfig,
  type UniverseChainId,
} from '@universe/chains'
import { isE2eTestEnv, isExtensionApp, REQUEST_SOURCE } from '@universe/environment'
import { FeatureFlags, getFeatureFlag, isStatsigClientRegistered } from '@universe/gating'
import { logger } from 'utilities/src/logger/logger'
import { selectRpcUrl } from 'uniswap/src/features/providers/rpcUrlSelector'
import { isUniRpcOnlyChain } from 'uniswap/src/features/providers/unirpcOnlyChains'

export { createRpcConfigResolver } from '@universe/chains'
export type { RpcConfigResolver, RpcConfigResolverInput } from '@universe/chains'

/**
 * Convenience resolver for call sites that can't receive deps via injection.
 * Prefer ProviderManager for provider access — this exists for the edge cases.
 *
 * This file ships to both the web app (Vite) and the browser extension (WXT).
 * Session strategy (RigoBlock fork): header-based on both — each request resolves
 * an X-Session-ID / X-Device-ID header pair from the session service. Upstream web
 * used cookie-based auth (credentials: 'include'), which the RigoBlock gateway's
 * wildcard CORS response makes impossible; the entry gateway accepts the header pair
 * and rejects unauthenticated /rpc/* calls with 401.
 *
 * Mobile uses the `.native.ts` sibling.
 */
const SHARED_UNI_RPC_CONFIG = {
  // UniRPC-only chains (Arc/Robinhood) always route through UniRPC; everything
  // else is flag-gated. Saga init runs before the Statsig provider mounts; guard
  // so the flag read doesn't trigger StatsigClient.instance()'s broken-fallback
  // branch.
  getFeatureFlag: (chainId: UniverseChainId) =>
    isUniRpcOnlyChain(chainId) || (isStatsigClientRegistered() && getFeatureFlag(FeatureFlags.UniRpcEnabled)),
  getEntryGatewayUrl,
  requestSource: REQUEST_SOURCE,
} as const

// Header-based session auth (extension AND RigoBlock web app). Upstream web uses
// cookie-based auth (credentials: 'include'), but the RigoBlock gateway answers CORS
// with Access-Control-Allow-Origin: *, which browsers reject for credentialed requests —
// and the entry gateway rejects unauthenticated /rpc/* calls with 401. The same gateway
// accepts the X-Session-ID / X-Device-ID header pair the extension sends, so the fork's
// web app authenticates the same way (session is created via the session client and
// stored in localStorage by provideSessionService, no cookies involved).
let hasWarnedMissingSession = false
const resolveHeaderSessionUniRpcHeaders = async (): Promise<Record<string, string>> => {
  const [session, deviceId] = await Promise.all([provideSessionStorage().get(), provideDeviceIdService().getDeviceId()])
  if (!session?.sessionId && !hasWarnedMissingSession) {
    hasWarnedMissingSession = true
    logger.warn(
      'resolveRpcConfig.web.ts',
      'resolveHeaderSessionUniRpcHeaders',
      'X-Session-ID unavailable — session not initialized; /rpc/* calls will 401. Check SessionService InitSession/Challenge/Verify in the network tab and localStorage UNISWAP_SESSION_ID.',
    )
  }
  return {
    ...(session?.sessionId && { 'X-Session-ID': session.sessionId }),
    ...(deviceId && { 'X-Device-ID': deviceId }),
  }
}

const webResolveUniRpcConfig = createUniRpcConfigResolver({
  ...SHARED_UNI_RPC_CONFIG,
  // Web app always routes through UniRPC; extension stays gated above.
  // Playwright e2e runs are the exception: UniRPC requires a session the test
  // environment can't establish (every /rpc/* call 401s), so let the resolver
  // fall through to the legacy chain-info URLs, which point at local anvil in e2e.
  // UniRPC-only chains intentionally follow this too — e2e has no gateway session
  // for them either — so this overrides the shared chain-aware getter.
  getFeatureFlag: () => !isE2eTestEnv(),
  // RigoBlock fork: header-based session auth — see resolveHeaderSessionUniRpcHeaders above.
  getRequestHeaders: resolveHeaderSessionUniRpcHeaders,
})

const extensionResolveUniRpcConfig = createUniRpcConfigResolver({
  ...SHARED_UNI_RPC_CONFIG,
  getRequestHeaders: resolveHeaderSessionUniRpcHeaders,
})

// Public RPCs now point at the entry gateway; when the legacy path returns one,
// authenticate it the same way the primary path does. Upstream: cookie on web,
// header on extension. RigoBlock fork: header-based on both — see above.
const asUniRpcConfig = (config: RpcConfig): RpcConfig => {
  if (!config.rpcUrl.startsWith(`${getEntryGatewayUrl()}/rpc/`)) {
    return config
  }
  const promoted: RpcConfig = {
    ...config,
    isUniRpc: true,
    headers: { 'x-request-source': REQUEST_SOURCE, ...config.headers },
  }
  return { ...promoted, getRequestHeaders: resolveHeaderSessionUniRpcHeaders }
}

export const defaultResolveRpcConfig = createRpcConfigResolver({
  resolveUniRpcConfig: isExtensionApp ? extensionResolveUniRpcConfig : webResolveUniRpcConfig,
  selectLegacyRpcUrl: selectRpcUrl,
  asUniRpcConfig,
})

import { TradingApi } from '@universe/api'
import { normalizeTokenAddressForCache } from '@universe/chains'

// RigoBlock: which Universal Router struct layouts a smart pool can decode on-chain depends on
// the AUniswapRouter adapter its fallback resolves through governance — NOT on the pool's own
// version. The pool fallback asks `IAuthority(authority).getApplicationAdapter(bytes4 selector)`
// (MixinFallback.sol); when the returned adapter matches the governance-mapped UR-2.1.2-capable
// adapter for that chain, the pool may request UR 2.1.2 calldata, otherwise it stays on 2.0.
// The web app injects the resolution context (Redux active smart pool + onchain adapter read)
// via `initializeSmartPoolUniversalRouterVersion`. Without an injected context (unit tests,
// extension) this module is a no-op and the trading API client keeps its default router version.

export interface SmartPoolRef {
  address: string
  chainId: number
}

export interface SmartPoolUniversalRouterVersionContext {
  getActiveSmartPool: () => SmartPoolRef | undefined
  getApplicationAdapter: (pool: SmartPoolRef) => Promise<string | undefined>
}

// Governance-mapped AUniswapRouter adapters that decode UR 2.1.2 calldata, by chain.
export const UR_2_1_2_APPLICATION_ADAPTERS: Partial<Record<number, string>> = {
  1: '0x8E0F4Cb68e276e31cF48B33EddD40325f5a736D2',
  42161: '0x8ae37870fffB694a5e90F0caE79208D186009Ae9',
  8453: '0x1A279E75FCAE3EBC12Db496BB015fA6614A1Af74',
  56: '0x1984D57212125eBcd10D5B339b4fEf176E95e4EE',
  10: '0x3F978C999CF56F393150D1d21B47d3096b5606B4',
  130: '0xA1aE17C6BF5cCECfb2efF519567B365bCA031Bdc',
  137: '0x1b2BCB8833bbB6a9f1eC6e41003E5daeb18a534a',
  11155111: '0x6e5aB204af73156F290927ae6936DDBB5A1dC3CD',
}

// Positive resolutions are stable for the lifetime of a governance adapter, so they are cached
// longer; failed reads retry sooner in case the RPC was only transiently unreachable.
const POSITIVE_CACHE_TTL_MS = 60_000
const NEGATIVE_CACHE_TTL_MS = 15_000

let injectedContext: SmartPoolUniversalRouterVersionContext | undefined

interface PoolAdapterCacheEntry {
  version: TradingApi.UniversalRouterVersion | undefined
  expiresAt: number
}

const poolAdapterCache = new Map<string, PoolAdapterCacheEntry>()

export function initializeSmartPoolUniversalRouterVersion(ctx: SmartPoolUniversalRouterVersionContext): void {
  injectedContext = ctx
}

// Test-only: clears the injected context and cache between test cases.
export function resetSmartPoolUniversalRouterVersionForTests(): void {
  injectedContext = undefined
  poolAdapterCache.clear()
}

/**
 * Resolves the Universal Router version the ACTIVE smart pool can decode, if any.
 * Returns `_2_1_2` only when an active smart pool exists on the same chain as the request and
 * governance maps its `getApplicationAdapter(0x3593564c)` result to a UR-2.1.2-capable adapter
 * for that chain; otherwise undefined (caller falls back to its default).
 */
export async function getSmartPoolUniversalRouterVersion(
  requestChainId: number | undefined,
): Promise<TradingApi.UniversalRouterVersion | undefined> {
  const ctx = injectedContext
  if (!ctx || requestChainId === undefined) {
    return undefined
  }
  const pool = ctx.getActiveSmartPool()
  // Only a pool on the same chain as the request can decode the calldata the API would build.
  if (!pool || pool.chainId !== requestChainId) {
    return undefined
  }

  const cacheKey = normalizeTokenAddressForCache(pool.address)
  const now = Date.now()
  const cached = poolAdapterCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.version
  }

  let adapter: string | undefined
  try {
    adapter = await ctx.getApplicationAdapter(pool)
  } catch {
    adapter = undefined
  }

  const expectedAdapter = UR_2_1_2_APPLICATION_ADAPTERS[pool.chainId]
  const version =
    expectedAdapter && adapter && normalizeTokenAddressForCache(adapter) === normalizeTokenAddressForCache(expectedAdapter)
      ? TradingApi.UniversalRouterVersion._2_1_2
      : undefined

  poolAdapterCache.set(cacheKey, {
    version,
    expiresAt: now + (version ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  })
  return version
}

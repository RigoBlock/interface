import { TradingApi } from '@universe/api'
import { normalizeTokenAddressForCache } from '@universe/chains'

// RigoBlock: the AUniswapDecoder bundled with a smart pool determines which Universal Router
// struct layouts the pool can decode on-chain. Protocol >= 4.4.7 ships a decoder that supports
// UR 2.1.2, so those pools may request 2.1.2 calldata; older pools must stay on 2.0.
// The web app injects the resolution context (Redux active smart pool + onchain VERSION read)
// via `initializeSmartPoolUniversalRouterVersion`. Without an injected context (unit tests,
// extension) this module is a no-op and the trading API client keeps its default router version.

export interface SmartPoolRef {
  address: string
  chainId: number
}

export interface SmartPoolUniversalRouterVersionContext {
  getActiveSmartPool: () => SmartPoolRef | undefined
  getSmartPoolVersion: (pool: SmartPoolRef) => Promise<string | undefined>
}

const MIN_UR_2_1_2_POOL_PROTOCOL = [4, 4, 7]

// Positive resolutions are stable for the lifetime of a pool deployment, so they are cached
// longer; failed reads retry sooner in case the RPC was only transiently unreachable.
const POSITIVE_CACHE_TTL_MS = 60_000
const NEGATIVE_CACHE_TTL_MS = 15_000

let injectedContext: SmartPoolUniversalRouterVersionContext | undefined

interface PoolVersionCacheEntry {
  version: TradingApi.UniversalRouterVersion | undefined
  expiresAt: number
}

const poolVersionCache = new Map<string, PoolVersionCacheEntry>()

export function initializeSmartPoolUniversalRouterVersion(ctx: SmartPoolUniversalRouterVersionContext): void {
  injectedContext = ctx
}

// Test-only: clears the injected context and cache between test cases.
export function resetSmartPoolUniversalRouterVersionForTests(): void {
  injectedContext = undefined
  poolVersionCache.clear()
}

// Extracts the leading numeric tuple from a version string, ignoring non-numeric suffixes
// (e.g. "4.4.7-beta" -> [4, 4, 7]). Returns undefined when no numeric component is present.
// Parsed manually to avoid unsafe-regex linting on the trivial digit/dot pattern.
function parseVersionTuple(version: string): number[] | undefined {
  const components: string[] = []
  let current = ''
  for (const char of version) {
    if (char >= '0' && char <= '9') {
      current += char
    } else if (char === '.' && current.length > 0) {
      components.push(current)
      current = ''
    } else {
      break
    }
  }
  if (current.length > 0) {
    components.push(current)
  }
  return components.length > 0 ? components.map(Number) : undefined
}

// Compares two numeric version tuples; missing trailing components count as 0 ("4.5" == "4.5.0").
function compareVersionTuples(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) {
      return diff < 0 ? -1 : 1
    }
  }
  return 0
}

/**
 * Resolves the Universal Router version the ACTIVE smart pool can decode, if any.
 * Returns `_2_1_2` only when an active smart pool exists on the same chain as the request and
 * its onchain VERSION() is >= 4.4.7; otherwise undefined (caller falls back to its default).
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
  const cached = poolVersionCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.version
  }

  let poolVersion: string | undefined
  try {
    poolVersion = await ctx.getSmartPoolVersion(pool)
  } catch {
    poolVersion = undefined
  }

  const version =
    poolVersion !== undefined &&
    compareVersionTuples(parseVersionTuple(poolVersion) ?? [], MIN_UR_2_1_2_POOL_PROTOCOL) >= 0
      ? TradingApi.UniversalRouterVersion._2_1_2
      : undefined

  poolVersionCache.set(cacheKey, {
    version,
    expiresAt: now + (version ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  })
  return version
}

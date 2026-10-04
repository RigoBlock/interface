import { TradingApi } from '@universe/api'
import { normalizeTokenAddressForCache } from '@universe/chains'

// RigoBlock: which Universal Router calldata flavor a smart pool can decode on-chain depends on
// the AUniswapRouter adapter its fallback resolves through governance — NOT on the pool's own
// version. The pool fallback asks `IAuthority(authority).getApplicationAdapter(bytes4 selector)`
// (MixinFallback.sol). Today governance maps the UR selectors to the UR-2.0.0-capable adapter
// deployment for each chain (`UR_2_0_0_APPLICATION_ADAPTERS` below), so the app must request the
// UR 2.0 calldata flavor. When RigoBlock governance upgrades UR support it re-points the selector
// at a NEW adapter that decodes the 2.1.2 flavor. So the rule is:
//   mapped adapter === UR_2_0_0_APPLICATION_ADAPTERS[chain]  -> keep requesting UR 2.0
//   mapped adapter !== that (any other non-zero address)     -> governance upgraded, request 2.1.2
// The selector is ALWAYS mapped, so a null/zero address means our read is wrong and MUST fail
// loudly — never silently fall back to a version guess.
// The web app injects the resolution context (Redux active smart pool + single onchain adapter
// read against the constant authority) via `initializeSmartPoolUniversalRouterVersion`. Without
// an injected context (unit tests, extension) this module is a no-op and the trading API client
// keeps its default router version.

export interface SmartPoolRef {
  address: string
  chainId: number
}

export interface SmartPoolUniversalRouterVersionContext {
  getActiveSmartPool: () => SmartPoolRef | undefined
  getApplicationAdapter: (pool: SmartPoolRef) => Promise<string>
}

// The AUniswapRouter adapters that decode UR 2.0.0 calldata — the deployments governance
// currently maps the UR selectors to, per chain. Do NOT rename this to something version-neutral
// and do NOT invert the comparison in `getSmartPoolUniversalRouterVersion`: a mapping that still
// returns one of these addresses means the pool decodes UR 2.0 and the app must keep requesting
// the 2.0 flavor; only a DIFFERENT non-zero address signals a governance upgrade to 2.1.2.
// Update this list if the UR-2.0.0 adapters are ever re-deployed.
export const UR_2_0_0_APPLICATION_ADAPTERS: Partial<Record<number, string>> = {
  1: '0x8d89AC596804704Fff512DAe5cAC19319F3AB560',
  42161: '0x27A707296078C535b8eCabc3A5E9B5E26a9C2140',
  8453: '0x2b75aD5cB2fa53fF93D20F38b5f3264Fbd1A6f82',
  56: '0x1dE6BA9EC7b30988af35F52A0Fce434409FB88A6',
  10: '0xE1db51fa21EB0D185778d8c25dF33FA356f34730',
  130: '0x767515c8A9d34dC66A5160bD58cd1d3EE03dAb00',
  137: '0xc4Eb59bf8606d96016af3664C5FDb08D67234078',
  11155111: '0x1CF61a7384C939B876A1F30129e6E18991b9cdD4',
}

// Positive resolutions are stable for the lifetime of a governance adapter, so they are cached
// longer; negative resolutions (old adapter still mapped) retry sooner in case governance just
// upgraded the mapping.
const POSITIVE_CACHE_TTL_MS = 60_000
const NEGATIVE_CACHE_TTL_MS = 15_000

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
 * Returns `_2_1_2` only when an active smart pool exists on the same chain as the request AND
 * governance's `getApplicationAdapter(0x3593564c)` mapping NO LONGER points at that chain's
 * UR-2.0.0 adapter (`UR_2_0_0_APPLICATION_ADAPTERS`) — i.e. governance upgraded the mapping to a
 * 2.1.2-capable adapter. While the mapping still returns the UR-2.0.0 adapter (today's state on
 * every chain), returns undefined and the caller keeps requesting UR 2.0. Throws — refusing to
 * guess — when the mapping read returns no adapter: the selector is always mapped, so null means
 * the read itself is wrong. RPC errors propagate for the same reason (neither flavor is a safe
 * guess when the mapping is unknown).
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

  // Single onchain read; not cached on failure so a wrong read is retried on the next request.
  const adapter = await ctx.getApplicationAdapter(pool)
  if (!adapter || normalizeTokenAddressForCache(adapter) === ZERO_ADDRESS) {
    throw new Error(
      `RigoBlock: authority getApplicationAdapter(0x3593564c) returned no adapter for pool ${pool.address} on chain ${pool.chainId}; the selector is always mapped, refusing to guess a Universal Router version`,
    )
  }

  const ur200Adapter = UR_2_0_0_APPLICATION_ADAPTERS[pool.chainId]
  // No known UR-2.0.0 adapter for this chain (e.g. HyperEvm): a non-zero mapping could be
  // anything, so stay on the 2.0 default rather than assume an upgrade.
  if (!ur200Adapter) {
    return undefined
  }

  // Mapping still points at the UR-2.0.0 adapter -> the pool decodes UR 2.0, keep the 2.0
  // default. Any OTHER non-zero address means governance re-mapped to a 2.1.2-capable adapter.
  const version =
    normalizeTokenAddressForCache(adapter) !== normalizeTokenAddressForCache(ur200Adapter)
      ? TradingApi.UniversalRouterVersion._2_1_2
      : undefined

  poolAdapterCache.set(cacheKey, {
    version,
    expiresAt: now + (version ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  })
  return version
}

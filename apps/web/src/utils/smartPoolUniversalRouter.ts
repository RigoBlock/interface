import { normalizeTokenAddressForCache } from '@universe/chains'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import {
  initializeSmartPoolUniversalRouterVersion,
  type SmartPoolRef,
} from 'uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion'
import { getContract } from 'utilities/src/contracts/getContract'
import { logger } from 'utilities/src/logger/logger'
import { RPC_PROVIDERS } from '~/constants/providers'
import store from '~/state'

// RigoBlock: injects the web app's smart-pool resolution context into the trading API client so
// `x-universal-router-version` can follow the AUniswapRouter adapter the active smart pool's
// fallback resolves via governance (UR-2.1.2-capable adapter -> 2.1.2; otherwise 2.0). Called
// once from `~/index.tsx` next to `initializePortfolioQueryOverrides`.

// execute(bytes,bytes[],uint256) — the selector the pool fallback resolves through
// IAuthority.getApplicationAdapter; governance upgrades it together with the other UR selectors.
const EXECUTE_SELECTOR = '0x3593564c'

const AUTHORITY_ADAPTER_ABI = ['function getApplicationAdapter(bytes4) view returns (address)']

const ADAPTER_CACHE_TTL_MS = 60_000

interface PoolAdapterCacheEntry {
  adapter: string | undefined
  expiresAt: number
}

// TTL cache guarding the onchain adapter read itself; the packages/uniswap helper additionally
// caches the resolved router version per pool address.
const poolAdapterCache = new Map<string, PoolAdapterCacheEntry>()

// Redux does not persist the active pool's chainId, so it is taken from the app's current chain:
// in the smart-pool swap context the active pool always operates on the app chain. A pool on any
// other chain simply never matches a request chainId and the client keeps its fallback version.
function getActiveSmartPool(): SmartPoolRef | undefined {
  const state = store.getState()
  const address = state.application.smartPool.address
  const chainId = state.application.chainId
  if (!address || chainId === null) {
    return undefined
  }
  return { address, chainId }
}

async function getApplicationAdapter(pool: SmartPoolRef): Promise<string | undefined> {
  const cacheKey = `${pool.chainId}:${normalizeTokenAddressForCache(pool.address)}`
  const now = Date.now()
  const cached = poolAdapterCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.adapter
  }

  const adapter = await readApplicationAdapter(pool)

  poolAdapterCache.set(cacheKey, { adapter, expiresAt: now + ADAPTER_CACHE_TTL_MS })
  return adapter
}

async function readApplicationAdapter(pool: SmartPoolRef): Promise<string | undefined> {
  const provider = pool.chainId in RPC_PROVIDERS ? RPC_PROVIDERS[pool.chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    return undefined
  }

  try {
    const poolContract = getContract({ address: pool.address, ABI: POOL_EXTENDED_ABI, provider })
    const authority = (await poolContract.authority()) as string
    const authorityContract = getContract({ address: authority, ABI: AUTHORITY_ADAPTER_ABI, provider })
    return (await authorityContract.getApplicationAdapter(EXECUTE_SELECTOR)) as string
  } catch (error) {
    // Pre-upgrade authority has no getApplicationAdapter, or the read failed — treat as no adapter.
    logger.warn(
      'smartPoolUniversalRouter.ts',
      'readApplicationAdapter',
      'Failed to read getApplicationAdapter from pool authority',
      { error, pool },
    )
    return undefined
  }
}

export function initializeSmartPoolUniversalRouterVersionForWeb(): void {
  initializeSmartPoolUniversalRouterVersion({ getActiveSmartPool, getApplicationAdapter })
}

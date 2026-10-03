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
// `x-universal-router-version` can follow the ACTIVE smart pool's onchain protocol version
// (>= 4.4.7 pools decode UR 2.1.2 calldata; older pools stay on 2.0). Called once from
// `~/index.tsx` next to `initializePortfolioQueryOverrides`.

const VERSION_CACHE_TTL_MS = 60_000

interface PoolVersionCacheEntry {
  version: string | undefined
  expiresAt: number
}

// TTL cache guarding the onchain VERSION() read itself; the packages/uniswap helper additionally
// caches the resolved router version per pool address.
const poolVersionCache = new Map<string, PoolVersionCacheEntry>()

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

async function getSmartPoolVersion(pool: SmartPoolRef): Promise<string | undefined> {
  const cacheKey = `${pool.chainId}:${normalizeTokenAddressForCache(pool.address)}`
  const now = Date.now()
  const cached = poolVersionCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.version
  }

  const version = await readPoolVersion(pool)

  poolVersionCache.set(cacheKey, { version, expiresAt: now + VERSION_CACHE_TTL_MS })
  return version
}

async function readPoolVersion(pool: SmartPoolRef): Promise<string | undefined> {
  const provider = pool.chainId in RPC_PROVIDERS ? RPC_PROVIDERS[pool.chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    return undefined
  }

  try {
    const contract = getContract({ address: pool.address, ABI: POOL_EXTENDED_ABI, provider })
    return (await contract.VERSION()) as string
  } catch (error) {
    logger.warn('smartPoolUniversalRouter.ts', 'readPoolVersion', 'Failed to read VERSION() from smart pool', {
      error,
      pool,
    })
    return undefined
  }
}

export function initializeSmartPoolUniversalRouterVersionForWeb(): void {
  initializeSmartPoolUniversalRouterVersion({ getActiveSmartPool, getSmartPoolVersion })
}

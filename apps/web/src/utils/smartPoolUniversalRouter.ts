import { normalizeTokenAddressForCache } from '@universe/chains'
import {
  initializeSmartPoolUniversalRouterVersion,
  type SmartPoolRef,
} from 'uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion'
import { getContract } from 'utilities/src/contracts/getContract'
import { RPC_PROVIDERS } from '~/constants/providers'
import store from '~/state'

// RigoBlock: injects the web app's smart-pool resolution context into the trading API client so
// `x-universal-router-version` follows the AUniswapRouter adapter the active smart pool's
// fallback resolves via governance (mapping still points at the UR-2.0.0 adapter -> request 2.0;
// governance re-mapped to a new adapter -> request 2.1.2). Called once from `~/index.tsx` next to
// `initializePortfolioQueryOverrides`.

// The RigoBlock authority is deployed at the same address on every chain. Reading the adapter
// mapping directly from it costs exactly ONE RPC call — do not read `pool.authority()` first.
const AUTHORITY_ADDRESS = '0xe35129A1E0BdB913CF6Fd8332E9d3533b5F41472'

// execute(bytes,bytes[],uint256) — the selector the pool fallback resolves through
// IAuthority.getApplicationAdapter. Governance upgrades it together with the other UR selectors
// (execute(bytes,bytes[]) 0x24856bc3, modifyLiquidities(bytes,uint256) 0xdd46508f), so checking
// this one mapping is sufficient.
const EXECUTE_SELECTOR = '0x3593564c'

const AUTHORITY_ADAPTER_ABI = ['function getApplicationAdapter(bytes4) view returns (address)']

const ADAPTER_CACHE_TTL_MS = 60_000

interface PoolAdapterCacheEntry {
  adapter: string
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

async function getApplicationAdapter(pool: SmartPoolRef): Promise<string> {
  const cacheKey = `${pool.chainId}:${normalizeTokenAddressForCache(pool.address)}`
  const now = Date.now()
  const cached = poolAdapterCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.adapter
  }

  // Intentionally no try/catch: the resolution module hard-fails when the mapping cannot be
  // read (a silent fallback could pick the wrong calldata flavor and revert the swap onchain).
  const adapter = (await readApplicationAdapter(pool.chainId)) as string

  poolAdapterCache.set(cacheKey, { adapter, expiresAt: now + ADAPTER_CACHE_TTL_MS })
  return adapter
}

async function readApplicationAdapter(chainId: number): Promise<string> {
  const provider = chainId in RPC_PROVIDERS ? RPC_PROVIDERS[chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    throw new Error(`RigoBlock: no RPC provider for chain ${chainId}, cannot read the authority adapter mapping`)
  }

  const authorityContract = getContract({ address: AUTHORITY_ADDRESS, ABI: AUTHORITY_ADAPTER_ABI, provider })
  return (await authorityContract.getApplicationAdapter(EXECUTE_SELECTOR)) as string
}

export function initializeSmartPoolUniversalRouterVersionForWeb(): void {
  initializeSmartPoolUniversalRouterVersion({ getActiveSmartPool, getApplicationAdapter })
}

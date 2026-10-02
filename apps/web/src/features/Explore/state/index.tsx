import { ALL_NETWORKS_ARG } from '@universe/api'
import { UniverseChainId } from '@universe/chains'
import { createContext, useContext, useMemo } from 'react'
import { useProtocolStatsQuery } from 'uniswap/src/data/apiClients/dataApiService/exploreV1/protocolStats'
import { useIsSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'

export const TABLE_PAGE_SIZE = 20

export const giveExploreStatDefaultValue = (value: number | undefined, defaultValue = 0): number => {
  return value ?? defaultValue
}

/** Resolved chain ID string for explore queries (from provider prop). */
const ExploreChainIdContext = createContext<string>(ALL_NETWORKS_ARG)

/** Chain id string from ExploreContextProvider (or ALL_NETWORKS when unset/unsupported). */
export function useExploreChainId(): string {
  return useContext(ExploreChainIdContext)
}

/** Hook that runs the protocol-stats query. Deduplicated by React Query. */
export function useProtocolStats() {
  const chainId = useExploreChainId()
  return useProtocolStatsQuery({ chainId })
}

export function ExploreContextProvider({
  chainId,
  children,
}: {
  chainId?: UniverseChainId
  children: React.ReactNode
}) {
  const isSupportedChain = useIsSupportedChainId(chainId)

  const chainIdStr = useMemo(() => {
    const chainIdOpt: UniverseChainId | undefined = chainId
    return !isSupportedChain || chainIdOpt === undefined ? ALL_NETWORKS_ARG : chainIdOpt.toString()
  }, [chainId, isSupportedChain])

  return <ExploreChainIdContext.Provider value={chainIdStr}>{children}</ExploreChainIdContext.Provider>
}

import type { ConnectError } from '@connectrpc/connect'
import type { UseQueryResult } from '@tanstack/react-query'
import { SearchTokensResponse } from '@uniswap/client-data-api/dist/data/v1/search_pb'
import { SearchType as SearchTypeV1, Pool } from '@uniswap/client-data-api/dist/data/v1/searchTypes_pb'
import { SearchResponse, SearchType } from '@uniswap/client-data-api/dist/data/v2/search_pb'
import { UniverseChainId, Platform } from '@universe/chains'
import { useIsV2EndpointsSearchEnabled } from '@universe/gating'
import { useMemo } from 'react'
import { rankedPoolToPoolSearchResult, useSearchQuery } from 'uniswap/src/data/apiClients/dataApiService/search/search'
import {
  searchPoolToPoolSearchResult,
  useSearchV1Query,
} from 'uniswap/src/data/apiClients/dataApiService/search/searchV1'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { PoolSearchResult } from 'uniswap/src/features/dataApi/types'
import { NUMBER_OF_RESULTS_LONG } from 'uniswap/src/features/search/SearchModal/constants'
import { useEvent } from 'utilities/src/react/hooks'

export function useSearchPools({
  searchQuery,
  chainFilter,
  skip,
  size = NUMBER_OF_RESULTS_LONG,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  skip: boolean
  size?: number
}): UseQueryResult<PoolSearchResult[], ConnectError> {
  const { chains: enabledChainIds } = useEnabledChains({ platform: Platform.EVM })
  const isSearchV2Enabled = useIsV2EndpointsSearchEnabled()

  const chainIds = useMemo(() => (chainFilter ? [chainFilter] : enabledChainIds), [chainFilter, enabledChainIds])

  const variablesV1 = useMemo(
    () => ({
      searchQuery: searchQuery ?? undefined,
      chainIds,
      searchType: SearchTypeV1.POOL,
      page: 1,
      size,
    }),
    [searchQuery, chainIds, size],
  )

  const poolSelectV1 = useEvent((response: SearchTokensResponse): PoolSearchResult[] => {
    const responsePools: Pool[] = response.pools
    return responsePools
      .map(searchPoolToPoolSearchResult)
      .filter((pool): pool is PoolSearchResult => pool !== undefined)
  })

  const v1Result = useSearchV1Query<PoolSearchResult[]>({
    input: variablesV1,
    enabled: !skip && !isSearchV2Enabled,
    select: poolSelectV1,
  })

  const variables = useMemo(
    () => ({
      searchQuery: searchQuery ?? undefined,
      chainIds,
      types: [SearchType.POOL],
      maxResults: size,
    }),
    [searchQuery, chainIds, size],
  )

  const poolSelect = useEvent((response: SearchResponse): PoolSearchResult[] =>
    response.pools.map(rankedPoolToPoolSearchResult).filter((pool): pool is PoolSearchResult => pool !== undefined),
  )

  const v2Result = useSearchQuery<PoolSearchResult[]>({
    input: variables,
    enabled: !skip && isSearchV2Enabled,
    select: poolSelect,
  })

  return isSearchV2Enabled ? v2Result : v1Result
}

import type { ConnectError } from '@connectrpc/connect'
import type { UseQueryResult } from '@tanstack/react-query'
import { SearchTokensResponse } from '@uniswap/client-data-api/dist/data/v1/search_pb'
import { SearchType as SearchTypeV1 } from '@uniswap/client-data-api/dist/data/v1/searchTypes_pb'
import { SearchResponse, SearchType } from '@uniswap/client-data-api/dist/data/v2/search_pb'
import { UniverseChainId, Platform } from '@universe/chains'
import { useIsV2EndpointsSearchEnabled } from '@universe/gating'
import { useMemo } from 'react'
import { useSearchQuery } from 'uniswap/src/data/apiClients/dataApiService/search/search'
import { useSearchV1Query } from 'uniswap/src/data/apiClients/dataApiService/search/searchV1'
import { toMultichainSearchResult } from 'uniswap/src/data/apiClients/dataApiService/search/toMultichainSearchResult'
import { transformSearchToMultichain } from 'uniswap/src/data/apiClients/dataApiService/search/transformSearchToMultichain'
import { dataApiMultichainTokenToSearchResult } from 'uniswap/src/data/apiClients/dataApiService/utils/dataApiMultichainToken'
import { useConnectionStatus } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { MultichainSearchResult } from 'uniswap/src/features/dataApi/types'
import { NUMBER_OF_RESULTS_LONG } from 'uniswap/src/features/search/SearchModal/constants'
import { useEvent } from 'utilities/src/react/hooks'

function useSearchV1Tokens<T>({
  searchQuery,
  chainFilter,
  chainIds,
  skip,
  size = NUMBER_OF_RESULTS_LONG,
  multichain = false,
  select,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  chainIds?: UniverseChainId[]
  skip: boolean
  size?: number
  multichain?: boolean
  select: (data: SearchTokensResponse) => T
}): UseQueryResult<T, ConnectError> {
  const { chains: enabledChainIds } = useEnabledChains()

  const isSvmConnected = useConnectionStatus(Platform.SVM).isConnected

  const variables = useMemo(
    () => ({
      searchQuery: searchQuery ?? undefined,
      chainIds: chainFilter ? [chainFilter] : (chainIds ?? enabledChainIds),
      searchType: SearchTypeV1.TOKEN,
      page: 1,
      size,
      prioritizeSvm: isSvmConnected,
      multichain,
      useSubstreamData: true,
    }),
    [searchQuery, chainFilter, chainIds, size, enabledChainIds, isSvmConnected, multichain],
  )

  return useSearchV1Query<T>({
    input: variables,
    enabled: !skip,
    select,
  })
}

/**
 * Search V2 (data.v2 SearchService) token query, used when the V2EndpointsSearch experiment arm is on.
 * Suppressed (lower-quality) tokens are appended after the default bucket per the Search V2 PRD's
 * infra-first milestone; the "see more" expando splits them out in a later UI milestone.
 * Unlike v1, the request carries no prioritizeSvm hint — v2 SearchRequest has no equivalent field
 * and the omission is intentional (see the PRD).
 */
function useSearchTokens({
  searchQuery,
  chainFilter,
  chainIds,
  skip,
  size = NUMBER_OF_RESULTS_LONG,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  chainIds?: UniverseChainId[]
  skip: boolean
  size?: number
}): UseQueryResult<MultichainSearchResult[], ConnectError> {
  const { chains: enabledChainIds } = useEnabledChains()

  const variables = useMemo(
    () => ({
      searchQuery: searchQuery ?? undefined,
      chainIds: chainFilter ? [chainFilter] : (chainIds ?? enabledChainIds),
      types: [SearchType.TOKEN],
      maxResults: size,
    }),
    [searchQuery, chainFilter, chainIds, size, enabledChainIds],
  )

  const select = useEvent((data: SearchResponse): MultichainSearchResult[] => {
    // maxResults caps each response bucket separately, so default + suppressed together can
    // exceed the caller's requested size — trim before converting.
    const results = [
      ...data.tokens.map((token) => ({ token, isSuppressed: false })),
      ...data.suppressedTokens.map((token) => ({ token, isSuppressed: true })),
    ]
      .slice(0, size)
      .map(({ token, isSuppressed }) => dataApiMultichainTokenToSearchResult(token, { isSuppressed }))
      .filter((r): r is MultichainSearchResult => r !== undefined)

    return filterMultichainResultsToChain(results, chainFilter)
  })

  return useSearchQuery<MultichainSearchResult[]>({
    input: variables,
    enabled: !skip,
    select,
  })
}

export function useMultichainSearchTokens({
  searchQuery,
  chainFilter,
  chainIds,
  skip,
  size,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  chainIds?: UniverseChainId[]
  skip: boolean
  size?: number
}): UseQueryResult<MultichainSearchResult[], ConnectError> {
  const isSearchV2Enabled = useIsV2EndpointsSearchEnabled()

  const select = useEvent((data: SearchTokensResponse): MultichainSearchResult[] => {
    const results = transformSearchToMultichain(data)
      .multichainTokens.map(toMultichainSearchResult)
      .filter((r): r is MultichainSearchResult => r !== undefined)

    return filterMultichainResultsToChain(results, chainFilter)
  })

  const v1Result = useSearchV1Tokens({
    searchQuery,
    chainFilter,
    chainIds,
    skip: skip || isSearchV2Enabled,
    size,
    multichain: true,
    select,
  })
  const v2Result = useSearchTokens({ searchQuery, chainFilter, chainIds, skip: skip || !isSearchV2Enabled, size })

  return isSearchV2Enabled ? v2Result : v1Result
}

export function filterMultichainResultsToChain(
  results: MultichainSearchResult[],
  chainFilter: UniverseChainId | null,
): MultichainSearchResult[] {
  if (!chainFilter) {
    return results
  }

  return results
    .map((result) => ({
      ...result,
      tokens: result.tokens.filter((token) => token.currency.chainId === chainFilter),
    }))
    .filter((result) => result.tokens.length > 0)
}

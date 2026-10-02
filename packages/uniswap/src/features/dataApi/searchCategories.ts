import type { ConnectError } from '@connectrpc/connect'
import type { UseQueryResult } from '@tanstack/react-query'
import { SearchResponse, SearchType } from '@uniswap/client-data-api/dist/data/v2/search_pb'
import type { UniverseChainId } from '@universe/chains'
import { useMemo } from 'react'
import { useSearchQuery } from 'uniswap/src/data/apiClients/dataApiService/search/search'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useEvent } from 'utilities/src/react/hooks'

function selectCategoryIds(data: SearchResponse): string[] {
  return data.categoryIds
}

/**
 * Category ids matching the query, in BE rank order. The response carries ids only; display data is
 * hydrated from the cached ListCategories result (see `toCategoryOptions`).
 */
export function useSearchCategoryIds({
  searchQuery,
  chainFilter,
  skip,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  skip: boolean
}): UseQueryResult<string[], ConnectError> {
  const { chains: enabledChainIds } = useEnabledChains()

  const variables = useMemo(
    () => ({
      searchQuery: searchQuery ?? undefined,
      chainIds: chainFilter ? [chainFilter] : enabledChainIds,
      types: [SearchType.CATEGORY],
    }),
    [searchQuery, chainFilter, enabledChainIds],
  )

  const select = useEvent(selectCategoryIds)

  return useSearchQuery<string[]>({
    input: variables,
    enabled: !skip,
    select,
  })
}

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { UniverseChainId } from '@universe/chains'
import { useIsTokenCategoriesEnabled } from '@universe/gating'
import { rankedCategoryToTokenCategory } from 'uniswap/src/data/apiClients/dataApiService/categories/categoryMappers'
import { dataApiServiceClientV2 } from 'uniswap/src/data/apiClients/dataApiService/clients/DataApiClientV2'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import type { TokenCategory } from 'uniswap/src/features/tokenCategories/types'
import { ReactQueryCacheKey } from 'utilities/src/reactQuery/cache'
import { ONE_MINUTE_MS } from 'utilities/src/time/time'

export function useListCategoriesQuery({
  chainIds: chainIdsOverride,
}: { chainIds?: UniverseChainId[] } = {}): UseQueryResult<TokenCategory[]> {
  const tokenCategoriesEnabled = useIsTokenCategoriesEnabled()
  const { chains: enabledChainIds } = useEnabledChains()
  const chainIds = chainIdsOverride ?? enabledChainIds

  return useQuery({
    queryKey: [ReactQueryCacheKey.DataApiService, 'listCategories', chainIds],
    queryFn: async (): Promise<TokenCategory[]> => {
      const response = await dataApiServiceClientV2.listCategories({ chainIds })
      return response.categories
        .map(rankedCategoryToTokenCategory)
        .filter((category): category is TokenCategory => category !== undefined)
    },
    enabled: tokenCategoriesEnabled,
    // The key includes chainIds, so a testnet-mode toggle would otherwise drop data mid-session
    // and transiently collapse the chip row back to the static set.
    placeholderData: keepPreviousData,
    staleTime: 5 * ONE_MINUTE_MS,
    gcTime: 30 * ONE_MINUTE_MS,
  })
}

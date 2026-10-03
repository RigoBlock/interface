import { TokensOrderBy } from '@uniswap/client-data-api/dist/data/v2/types_pb'
import { useMemo } from 'react'
import { useListCategoriesQuery } from 'uniswap/src/data/apiClients/dataApiService/categories/useListCategoriesQuery'
import { useExploreListTokens } from 'uniswap/src/data/apiClients/dataApiService/explore/useExploreListTokens'
import {
  rankedTokenToCardItem,
  type RankedTokenCardItem,
} from 'uniswap/src/data/apiClients/dataApiService/utils/rankedTokenCardItem'
import { findTrendingCategory } from 'uniswap/src/features/tokenCategories/findTrendingCategory'
import type { TokenCategory } from 'uniswap/src/features/tokenCategories/types'
import { useBackendSupportedChainIds } from '~/hooks/useBackendSupportedChainIds'

export const TRENDING_CAROUSEL_TOKEN_COUNT = 12

export function useTrendingCarouselTokens(): {
  tokens: RankedTokenCardItem[]
  isLoading: boolean
  trendingCategory: TokenCategory | undefined
} {
  const { data: categories, isPending: categoriesPending } = useListCategoriesQuery()
  const trendingCategory = findTrendingCategory(categories)
  const trendingCategoryId = trendingCategory?.id
  // Data API cannot serve HyperEvm (999) — requests carrying it 400 with "unrecognized chains".
  const chainIds = useBackendSupportedChainIds()

  // TODO(CONS-3522): swap to the non-paginated ListTokens query; the carousel never pages.
  const { multichainTokens, isLoading: tokensLoading } = useExploreListTokens({
    chainIds,
    orderBy: TokensOrderBy.VOLUME_1D,
    ascending: false,
    pageSize: TRENDING_CAROUSEL_TOKEN_COUNT,
    categoryId: trendingCategoryId,
    enabled: trendingCategoryId !== undefined,
  })

  const tokens = useMemo(
    () => multichainTokens.flatMap((token) => rankedTokenToCardItem(token) ?? []),
    [multichainTokens],
  )

  return { tokens, isLoading: categoriesPending || tokensLoading, trendingCategory }
}

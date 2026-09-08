import { ALL_NETWORKS_ARG, CustomRankingType } from '@universe/api'
import { useMemo } from 'react'
import { tokenRankingsStatToCurrencyInfo, useTokenRankingsQuery } from 'uniswap/src/data/rest/tokenRankings'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'

export function useTrendingTokensCurrencyInfos(
  chainFilter: Maybe<UniverseChainId>,
  skip?: boolean,
): {
  data: CurrencyInfo[] | undefined
  error: Error | undefined
  refetch: () => void
  loading: boolean
} {
  // Chains without backend support (e.g. HyperEVM) are not indexed by the rankings
  // service — skip the query instead of surfacing a load error.
  const isChainIndexed = !chainFilter || isBackendSupportedChainId(chainFilter)
  const { data, isLoading, error, refetch, isFetching } = useTokenRankingsQuery(
    {
      chainId: chainFilter?.toString() ?? ALL_NETWORKS_ARG,
    },
    !skip && isChainIndexed,
  )

  const trendingTokens = data?.tokenRankings[CustomRankingType.Trending]?.tokens
  const formattedTokens = useMemo(
    () => trendingTokens?.map(tokenRankingsStatToCurrencyInfo).filter((t): t is CurrencyInfo => Boolean(t)),
    [trendingTokens],
  )

  return {
    data: isChainIndexed ? formattedTokens : [],
    loading: isChainIndexed ? isLoading || isFetching : false,
    error: error ?? undefined,
    refetch,
  }
}

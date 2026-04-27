import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import type { TradingApi, UseQueryApiHelperHookArgs } from '@universe/api'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { ReactQueryCacheKey } from 'utilities/src/reactQuery/cache'

/** @deprecated Use liquidityQueries.decreasePosition via useLiquidityServiceQuery instead */
export function useDecreaseLpPositionCalldataQuery({
  params,
  deadlineInMinutes: _deadlineInMinutes,
  ...rest
}: UseQueryApiHelperHookArgs<TradingApi.DecreasePositionRequest, TradingApi.DecreasePositionResponse> & {
  deadlineInMinutes: number | undefined
}): UseQueryResult<TradingApi.DecreasePositionResponse> {
  const queryKey = [ReactQueryCacheKey.TradingApi, uniswapUrls.tradingApiPaths.decreaseLp, params]

  return useQuery<TradingApi.DecreasePositionResponse>({
    queryKey,
    queryFn: async () => {
      throw new Error('useDecreaseLpPositionCalldataQuery is deprecated; use liquidityQueries.decreasePosition')
    },
    ...rest,
  })
}

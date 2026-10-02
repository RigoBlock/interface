import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import type { TradingApi, UseQueryApiHelperHookArgs } from '@universe/api'
import { ReactQueryCacheKey } from 'utilities/src/reactQuery/cache'

// Kept from the legacy `uniswapUrls.tradingApiPaths` table (removed upstream) so the
// deprecated query key stays stable for any in-flight cache entries.
const DECREASE_LP_PATH = '/v1/lp/decrease'

/** @deprecated Use liquidityQueries.decreasePosition via useLiquidityServiceQuery instead */
export function useDecreaseLpPositionCalldataQuery({
  params,
  deadlineInMinutes: _deadlineInMinutes,
  ...rest
}: UseQueryApiHelperHookArgs<TradingApi.DecreasePositionRequest, TradingApi.DecreasePositionResponse> & {
  deadlineInMinutes: number | undefined
}): UseQueryResult<TradingApi.DecreasePositionResponse> {
  const queryKey = [ReactQueryCacheKey.TradingApi, DECREASE_LP_PATH, params]

  return useQuery<TradingApi.DecreasePositionResponse>({
    queryKey,
    queryFn: async () => {
      throw new Error('useDecreaseLpPositionCalldataQuery is deprecated; use liquidityQueries.decreasePosition')
    },
    ...rest,
  })
}

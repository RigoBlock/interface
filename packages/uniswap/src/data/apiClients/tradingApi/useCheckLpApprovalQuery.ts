import { UseQueryResult, useQuery } from '@tanstack/react-query'
import { TradingApi, UseQueryApiHelperHookArgs } from '@universe/api'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { ReactQueryCacheKey } from 'utilities/src/reactQuery/cache'

/** @deprecated Use liquidityQueries.checkApproval via useLiquidityServiceQuery instead */
export function useCheckLpApprovalQuery({
  params,
  ...rest
}: UseQueryApiHelperHookArgs<TradingApi.LPApprovalRequest, TradingApi.LPApprovalResponse>): UseQueryResult<TradingApi.LPApprovalResponse> {
  const queryKey = [ReactQueryCacheKey.TradingApi, uniswapUrls.tradingApiPaths.lpApproval, params]

  return useQuery<TradingApi.LPApprovalResponse>({
    queryKey,
    queryFn: async () => {
      throw new Error('useCheckLpApprovalQuery is deprecated; use liquidityQueries.checkApproval')
    },
    ...rest,
  })
}

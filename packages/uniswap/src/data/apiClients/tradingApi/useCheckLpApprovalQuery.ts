import { UseQueryResult, useQuery } from '@tanstack/react-query'
import { TradingApi, UseQueryApiHelperHookArgs } from '@universe/api'
import { ReactQueryCacheKey } from 'utilities/src/reactQuery/cache'

// Kept from the legacy `uniswapUrls.tradingApiPaths` table (removed upstream) so the
// deprecated query key stays stable for any in-flight cache entries.
const LP_APPROVAL_PATH = '/v1/lp/approve'

/** @deprecated Use liquidityQueries.checkApproval via useLiquidityServiceQuery instead */
export function useCheckLpApprovalQuery({
  params,
  ...rest
}: UseQueryApiHelperHookArgs<
  TradingApi.LPApprovalRequest,
  TradingApi.LPApprovalResponse
>): UseQueryResult<TradingApi.LPApprovalResponse> {
  const queryKey = [ReactQueryCacheKey.TradingApi, LP_APPROVAL_PATH, params]

  return useQuery<TradingApi.LPApprovalResponse>({
    queryKey,
    queryFn: async () => {
      throw new Error('useCheckLpApprovalQuery is deprecated; use liquidityQueries.checkApproval')
    },
    ...rest,
  })
}

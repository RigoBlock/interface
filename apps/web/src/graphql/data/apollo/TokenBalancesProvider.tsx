import { usePendingActivity } from 'components/AccountDrawer/MiniPortfolio/Activity/hooks'
import { createAdaptiveRefetchContext } from 'graphql/data/apollo/AdaptiveRefetch'
import { useAssetActivitySubscription } from 'graphql/data/apollo/AssetActivityProvider'
import { GQL_MAINNET_CHAINS_MUTABLE } from 'graphql/data/util'
import { useAccount } from 'hooks/useAccount'
import { PropsWithChildren, useCallback, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useActiveSmartPool } from 'state/application/hooks'
import {
  OnAssetActivitySubscription,
  PortfolioBalancesWebQueryResult,
  SwapOrderStatus,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  usePortfolioBalancesWebLazyQuery,
} from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'
import { useHideSmallBalancesSetting, useHideSpamTokensSetting } from 'uniswap/src/features/settings/hooks'
import { UniswapEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { InterfaceChainId } from 'uniswap/src/types/chains'
import { SUBSCRIPTION_CHAINIDS } from 'utilities/src/apollo/constants'
import { usePrevious } from 'utilities/src/react/hooks'

const {
  Provider: AdaptiveTokenBalancesProvider,
  useQuery: useTokenBalancesQuery,
  PrefetchWrapper: PrefetchBalancesWrapper,
} = createAdaptiveRefetchContext<PortfolioBalancesWebQueryResult>()

/** Returns whether an update may affect token balances. */
function mayAffectTokenBalances(data?: OnAssetActivitySubscription) {
  // Special case: non-filled order status updates do not affect balances.
  if (
    data?.onAssetActivity?.details.__typename === 'SwapOrderDetails' &&
    data.onAssetActivity.details.orderStatus !== SwapOrderStatus.Filled
  ) {
    return false
  }

  return true
}

function useIsRealtime() {
  const { chainId } = useAccount()
  const isRealtimeEnabled = useFeatureFlag(FeatureFlags.Realtime)

  return isRealtimeEnabled && chainId && (SUBSCRIPTION_CHAINIDS as unknown as InterfaceChainId[]).includes(chainId)
}

function useHasAccountUpdate() {
  // Used to detect account updates without relying on subscription data.
  const { pendingActivityCount } = usePendingActivity()
  const prevPendingActivityCount = usePrevious(pendingActivityCount)
  const hasLocalStateUpdate = !!prevPendingActivityCount && pendingActivityCount < prevPendingActivityCount

  const isRealtime = useIsRealtime()

  const { data } = useAssetActivitySubscription()
  const prevData = usePrevious(data)

  const account = useAccount()
  const prevAccount = usePrevious(account.address)

  const { address: smartPool } = useActiveSmartPool()
  const prevSmartPool = usePrevious(smartPool)

  const { pathname: page } = useLocation()
  const prevPage = usePrevious(page)

  return useMemo(() => {
    const hasPolledTxUpdate = !isRealtime && hasLocalStateUpdate
    const hasSubscriptionTxUpdate = data !== prevData && mayAffectTokenBalances(data)
    const accountChanged = Boolean(prevAccount !== account.address && account.address)
    const smartPoolChanged = Boolean(prevSmartPool !== smartPool && smartPool)
    const sendPageChanged = page !== prevPage && !!smartPool && (page === '/send' || prevPage === '/send')

    return hasPolledTxUpdate || hasSubscriptionTxUpdate || accountChanged || smartPoolChanged || sendPageChanged
  }, [account.address, data, smartPool, hasLocalStateUpdate, isRealtime, prevAccount, prevData, prevSmartPool, page, prevPage])
}

function usePortfolioValueModifiers(): {
  includeSmallBalances: boolean
  includeSpamTokens: boolean
} {
  const hideSmallBalances = useHideSmallBalancesSetting()
  const hideSpamTokens = useHideSpamTokensSetting()
  return useMemo(
    () => ({
      includeSmallBalances: !hideSmallBalances,
      includeSpamTokens: !hideSpamTokens,
    }),
    [hideSmallBalances, hideSpamTokens],
  )
}

export function TokenBalancesProvider({ children }: PropsWithChildren) {
  const [lazyFetch, query] = usePortfolioBalancesWebLazyQuery({ errorPolicy: 'all' })
  const account = useAccount()
  const hasAccountUpdate = useHasAccountUpdate()
  const valueModifiers = usePortfolioValueModifiers()
  const prevValueModifiers = usePrevious(valueModifiers)
  // TODO: query default pool with hook and either conditionally set, or just use pool
  const { address: smartPoolAddress } = useActiveSmartPool()

  // TODO: define shouldQueryPoolBalances as useMemo to check if we can set correct state without further updating
  // on send we only allow user token transfer, as smart pool cannot execute arbitrary transfers
  const { pathname: page } = useLocation()
  const isSendPage = page === '/send'
  const shouldQueryPoolBalances = smartPoolAddress && !isSendPage

  const fetch = useCallback(() => {
    if (!account.address) {
      return
    }
    lazyFetch({
      variables: {
        ownerAddress: shouldQueryPoolBalances ? smartPoolAddress : account.address,
        chains: GQL_MAINNET_CHAINS_MUTABLE,
        includeSpamTokens: valueModifiers.includeSpamTokens,
        includeSmallBalances: valueModifiers.includeSmallBalances,
      },
    })
  }, [account.address, lazyFetch, smartPoolAddress, shouldQueryPoolBalances, valueModifiers])

  return (
    <AdaptiveTokenBalancesProvider
      query={query}
      fetch={fetch}
      stale={hasAccountUpdate || valueModifiers !== prevValueModifiers}
    >
      {children}
    </AdaptiveTokenBalancesProvider>
  )
}

/**
 * Retrieves cached token balances, avoiding new fetches to reduce backend load.
 * Analytics should use balances from transaction flows instead of initiating fetches at pageload.
 */
export function useTotalBalancesUsdForAnalytics(): number | undefined {
  return useTokenBalancesQuery({ cacheOnly: true }).data?.portfolios?.[0]?.tokensTotalDenominatedValue?.value
}

export function useReportTotalBalancesUsdForAnalytics() {
  const account = useAccount()
  const portfolioBalanceUsd = useTotalBalancesUsdForAnalytics()

  useEffect(() => {
    if (!portfolioBalanceUsd || !account.address) {
      return
    }

    sendAnalyticsEvent(UniswapEventName.BalancesReport, {
      total_balances_usd: portfolioBalanceUsd,
      wallets: [account.address],
      balances: [portfolioBalanceUsd],
    })
  }, [portfolioBalanceUsd, account.address])
}

export { PrefetchBalancesWrapper, useTokenBalancesQuery }

import { AdaptiveTokenBalancesProvider } from 'appGraphql/data/apollo/AdaptiveTokenBalancesProvider'
import { apolloClient } from 'appGraphql/data/apollo/client'
import { useQueryClient } from '@tanstack/react-query'
import { GraphQLApi } from '@universe/api'
import { usePendingActivity } from 'components/AccountDrawer/MiniPortfolio/Activity/hooks'
import { useAccount } from 'hooks/useAccount'
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useActiveSmartPool } from 'state/application/hooks'
import { useWatchTransactionsCallback } from 'state/sagas/transactions/watcherSaga'
import { usePendingTransactions } from 'state/transactions/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
// biome-ignore lint/style/noRestrictedImports: This import is needed for fetching portfolio value modifiers despite being restricted
import { usePortfolioValueModifiers } from 'uniswap/src/features/dataApi/balances/balances'
import { usePrevious } from 'utilities/src/react/hooks'

function useHasAccountUpdate() {
  // Used to detect account updates without relying on subscription data.
  const { pendingActivityCount } = usePendingActivity()
  const prevPendingActivityCount = usePrevious(pendingActivityCount)
  const hasLocalStateUpdate = !!prevPendingActivityCount && pendingActivityCount < prevPendingActivityCount

  const account = useAccount()
  const prevAccount = usePrevious(account.address)

  const { address: smartPool } = useActiveSmartPool()
  const prevSmartPool = usePrevious(smartPool)

  const { pathname: page } = useLocation()
  const prevPage = usePrevious(page)

  const { isTestnetModeEnabled } = useEnabledChains()
  const prevIsTestnetModeEnabled = usePrevious(isTestnetModeEnabled)

  return useMemo(() => {
    const hasPolledTxUpdate = hasLocalStateUpdate
    const accountChanged = Boolean(prevAccount !== account.address && account.address)
    const hasTestnetModeChanged = prevIsTestnetModeEnabled !== isTestnetModeEnabled
    const smartPoolChanged = Boolean(prevSmartPool !== smartPool && smartPool)
    const sendPageChanged = page !== prevPage && !!smartPool && (page === '/send' || prevPage === '/send')

    return hasPolledTxUpdate || accountChanged || hasTestnetModeChanged || smartPoolChanged || sendPageChanged
  }, [
    account.address,
    smartPool,
    page,
    hasLocalStateUpdate,
    prevAccount,
    prevSmartPool,
    prevPage,
    prevIsTestnetModeEnabled,
    isTestnetModeEnabled,
  ])
}

function TokenBalancesProviderInternal({ children }: PropsWithChildren) {
  const [lazyFetch, query] = GraphQLApi.usePortfolioBalancesLazyQuery({ errorPolicy: 'all' })
  const account = useAccount()
  const hasAccountUpdate = useHasAccountUpdate()
  const queryClient = useQueryClient()

  const valueModifiers = usePortfolioValueModifiers(account.address)
  const prevValueModifiers = usePrevious(valueModifiers)

  const { gqlChains } = useEnabledChains()
  const pendingTransactions = usePendingTransactions()
  const prevPendingTransactions = usePrevious(pendingTransactions)
  const pendingDiff = useMemo(
    () => prevPendingTransactions?.filter((tx) => !pendingTransactions.includes(tx)),
    [pendingTransactions, prevPendingTransactions],
  )
  const watchTransactions = useWatchTransactionsCallback()
  // TODO: query default pool with hook and either conditionally set, or just use pool
  const { address: smartPoolAddress } = useActiveSmartPool()

  // TODO: define shouldQueryPoolBalances as useMemo to check if we can set correct state without further updating
  // on send we only allow user token transfer, as smart vault cannot execute arbitrary transfers
  const { pathname: page } = useLocation()
  const isSendPage = page === '/send'
  const shouldQueryPoolBalances = smartPoolAddress && !isSendPage

  useEffect(() => {
    if (!account.address || !account.chainId) {
      return
    }

    if (!pendingDiff?.length) {
      return
    }

    watchTransactions({
      address: account.address,
      chainId: account.chainId,
      pendingDiff,
      apolloClient,
      queryClient,
    })
  }, [pendingDiff, account.address, account.chainId, watchTransactions, queryClient])

  const fetch = useCallback(() => {
    if (!account.address) {
      return
    }

    lazyFetch({
      variables: {
        ownerAddress: shouldQueryPoolBalances ? smartPoolAddress : account.address,
        chains: gqlChains,
        valueModifiers,
      },
    })
  }, [account.address, gqlChains, lazyFetch, valueModifiers, smartPoolAddress, shouldQueryPoolBalances])

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

export function TokenBalancesProvider({ children }: PropsWithChildren) {
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    setInitialized(true)
  }, [])

  if (!initialized) {
    return null
  }

  return <TokenBalancesProviderInternal>{children}</TokenBalancesProviderInternal>
}

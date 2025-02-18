import { SubscriptionResult } from '@apollo/client'
import { createAdaptiveRefetchContext } from 'graphql/data/apollo/AdaptiveRefetch'
import { useAccount } from 'hooks/useAccount'
import usePrevious from 'hooks/usePrevious'
import ms from 'ms'
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useActiveSmartPool } from 'state/application/hooks'
import { useFiatOnRampTransactions } from 'state/fiatOnRampTransactions/hooks'
import {
  ActivityWebQueryResult,
  AssetActivityPartsFragment,
  Exact,
  OnAssetActivitySubscription,
  useActivityWebLazyQuery,
  useOnAssetActivitySubscription,
} from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'
import { logger } from 'utilities/src/logger/logger'
import { useInterval } from 'utilities/src/time/timing'
import { v4 as uuidV4 } from 'uuid'

const { Provider: AdaptiveAssetActivityProvider, useQuery: useAssetActivityQuery } =
  createAdaptiveRefetchContext<ActivityWebQueryResult>()

const SubscriptionContext = createContext<
  SubscriptionResult<OnAssetActivitySubscription, Exact<{ account: string; subscriptionId: string }>> | undefined
>(undefined)

export function AssetActivityProvider({ children }: PropsWithChildren) {
  const account = useAccount()
  const previousAccount = usePrevious(account.address)
  const { isTestnetModeEnabled, gqlChains } = useEnabledChains()
  const previousIsTestnetModeEnabled = usePrevious(isTestnetModeEnabled)
  const activeSmartPool = useActiveSmartPool()

  const { pathname: page } = useLocation()
  const isSendPage = page === '/send'
  const shouldQueryPoolBalances = activeSmartPool.address && !isSendPage

  const contextAddress = shouldQueryPoolBalances ? activeSmartPool.address : account.address

  const isRealtimeEnabled = useFeatureFlag(FeatureFlags.Realtime)
  const [attempt, incrementAttempt] = useReducer((attempt) => attempt + 1, 1)
  const subscriptionId = useMemo(uuidV4, [account, attempt])
  const result = useOnAssetActivitySubscription({
    variables: { account: contextAddress ?? '', subscriptionId },
    skip: !account || !isRealtimeEnabled,
    onError: (error) => {
      logger.error(error, {
        tags: {
          file: 'AssetActivityProvider',
          function: 'useOnAssetActivitySubscription#onError',
        },
      })
      incrementAttempt()
    },
  })

  const fiatOnRampTransactions = useFiatOnRampTransactions()

  const [lazyFetch, query] = useActivityWebLazyQuery()
  const fetch = useCallback(
    () =>
      lazyFetch({
        variables: {
          account: contextAddress ?? '',
          chains: gqlChains,
          // Backend will return off-chain activities even if gqlChains are all testnets.
          includeOffChain: !isTestnetModeEnabled,
          // Include the externalsessionIDs of all fiat on-ramp transactions in the local store,
          // so that the backend can find the transactions without signature authentication.
          onRampTransactionIDs: Object.values(fiatOnRampTransactions).map(
            (transaction) => transaction.externalSessionId,
          ),
        },
      }),
    [lazyFetch, contextAddress, gqlChains, isTestnetModeEnabled, fiatOnRampTransactions],
  )

  useInterval(async () => {
    if (
      Object.values(fiatOnRampTransactions).some(
        (transaction) => !transaction.syncedWithBackend && transaction.forceFetched,
      )
    ) {
      fetch()
    }
  }, ms('15s'))

  return (
    <SubscriptionContext.Provider value={result}>
      <AdaptiveAssetActivityProvider
        query={query}
        fetch={fetch}
        stale={account.address !== previousAccount || isTestnetModeEnabled !== previousIsTestnetModeEnabled}
      >
        {children}
      </AdaptiveAssetActivityProvider>
    </SubscriptionContext.Provider>
  )
}

export function useAssetActivitySubscription() {
  const value = useContext(SubscriptionContext)
  if (!value) {
    throw new Error('useAssetActivitySubscription must be used within an AssetActivityProvider')
  }
  return value
}

function useSubscribedActivities() {
  const account = useAccount()
  const previousAccount = usePrevious(account.address)

  const activeSmartPool = useActiveSmartPool()
  const previousSmartPool = usePrevious(activeSmartPool.address)

  const [subscribedActivities, setSubscribedActivities] = useState<AssetActivityPartsFragment[]>([])

  // TODO: check we are updating correctly in the case a smart pool exists and the user account is
  //  changed, i.e. mobile wallets
  // Clear the subscribed activity list when the account changes.
  useEffect(() => {
    if (!activeSmartPool.address && account.address !== previousAccount) {
      setSubscribedActivities([])
    }
    if (activeSmartPool.address && activeSmartPool.address !== previousSmartPool) {
      setSubscribedActivities([])
    }
  }, [account.address, previousAccount, activeSmartPool.address, previousSmartPool])

  // Update the subscribed activity list when a new activity is received from the subscription service.
  const subscription = useAssetActivitySubscription()
  useEffect(() => {
    const subscribedActivity = subscription.data?.onAssetActivity
    if (subscribedActivity) {
      setSubscribedActivities((prev) => [subscribedActivity, ...prev])
    }
  }, [subscription.data?.onAssetActivity])

  return subscribedActivities
}

export function useAssetActivity() {
  const query = useAssetActivityQuery()
  const { loading, data } = query
  const fetchedActivities = data?.portfolios?.[0]?.assetActivities
  const subscribedActivities = useSubscribedActivities()

  const activities = useMemo(() => {
    if (!fetchedActivities) {
      return subscribedActivities
    }
    return [...subscribedActivities, ...fetchedActivities]
  }, [subscribedActivities, fetchedActivities])

  return { activities, loading }
}

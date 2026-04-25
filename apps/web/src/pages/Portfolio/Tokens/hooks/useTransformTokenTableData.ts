import { NetworkStatus } from '@apollo/client'
import { GetWalletTokensProfitLossResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useMemo } from 'react'
import { DEFAULT_NATIVE_ADDRESS } from 'uniswap/src/features/chains/evm/rpc'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isStablecoinAddress } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import type { PortfolioChainBalance, PortfolioMultichainBalance } from 'uniswap/src/features/dataApi/types'
import {
  flattenPortfolioMultichainBalanceToSingleChainRows,
  partitionMultichainBalancesByPerChainVisibility,
} from 'uniswap/src/features/portfolio/balances/buildExtensionMultichainBalancesListData'
import { useSortedPortfolioBalancesMultichain } from 'uniswap/src/features/portfolio/balances/hooks'
import { useCurrencyIdToVisibility } from 'uniswap/src/features/transactions/selectors'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { currencyAddress } from 'uniswap/src/utils/currencyId'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'

/** Per-chain token instance (use TokenData['tokens'][number] in other modules) */
interface TokenDataToken {
  chainId: number
  currencyInfo: CurrencyInfo
  quantity: number
  valueUsd: number
  symbol: string | undefined
  isHidden: boolean | null | undefined
}

export interface TokenData {
  id: string
  testId: string
  chainId: number
  currencyInfo: CurrencyInfo
  quantity: number
  name: string
  symbol: string | undefined
  price: number | undefined
  change1d: number | undefined
  tokens: TokenDataToken[]
  totalValue: number
  allocation: number
  avgCost?: number
  unrealizedPnl?: number
  unrealizedPnlPercent?: number
  isStablecoin: boolean
}

// Custom hook to format portfolio data
// When flag OFF: do not request multichain from backend → backend returns legacy → we transform to multichain shape for the table.
// When flag ON: request multichain from backend → backend returns portfolio.multichainBalances → no transform needed.
export function useTransformTokenTableData({
  chainIds,
  limit,
  tokenProfitLossData,
}: {
  chainIds?: UniverseChainId[]
  limit?: number
  tokenProfitLossData?: GetWalletTokensProfitLossResponse
}): {
  visible: TokenData[] | null
  hidden: TokenData[] | null
  totalCount: number | null
  loading: boolean
  refetching: boolean
  error: Error | undefined
  refetch: (() => void) | undefined
  networkStatus: NetworkStatus
} {
  const { evmAddress, svmAddress } = usePortfolioAddresses()
  const multichainTokenUxEnabled = useFeatureFlag(FeatureFlags.MultichainTokenUx)
  const ownerAddresses = useMemo(
    () => [evmAddress, svmAddress].filter((a): a is Address => !!a),
    [evmAddress, svmAddress],
  )
  const currencyIdToTokenVisibility = useCurrencyIdToVisibility(ownerAddresses)
  const { isTestnetModeEnabled } = useEnabledChains()

  const {
    data: sortedBalances,
    loading,
    error,
    refetch,
    networkStatus,
  } = useSortedPortfolioBalancesMultichain({
    evmAddress,
    svmAddress,
    chainIds,
    // Flag OFF: legacy data from backend, transform to multichain shape on client. Flag ON: multichain (mock) data from backend.
    requestMultichainFromBackend: multichainTokenUxEnabled,
  })

  return useMemo(() => {
    // Only show empty state on initial load, not during refetch.
    // networkStatus === NetworkStatus.loading means the query has never completed.
    // This is synchronously true from the very first render when there is no cached data, even before isFetching is set.
    const isInitialLoading = networkStatus === NetworkStatus.loading && !sortedBalances
    const isRefetching = loading && !!sortedBalances

    if (isInitialLoading) {
      return {
        visible: null,
        hidden: null,
        totalCount: null,
        loading: true,
        refetching: false,
        error,
        refetch,
        networkStatus,
      }
    }

    if (!sortedBalances) {
      // During an outage with no cached data, show the table with loading skeletons
      // instead of the "No tokens yet" empty state
      if (error) {
        return {
          visible: null,
          hidden: null,
          totalCount: null,
          loading: true,
          refetching: false,
          error,
          refetch,
          networkStatus,
        }
      }
      return { visible: [], hidden: [], totalCount: 0, loading, refetching: false, error, refetch, networkStatus }
    }

    const balancesWithTokens = (balances: PortfolioMultichainBalance[]): PortfolioMultichainBalance[] =>
      balances.filter((b) => b.tokens.length > 0)

    const visibleBalances = balancesWithTokens(sortedBalances.balances)
    const hiddenBalancesFiltered = balancesWithTokens(sortedBalances.hiddenBalances)

    const { partitions: visibleBalancePartitions, totalUsdVisible: totalUSDVisible } =
      partitionMultichainBalancesByPerChainVisibility({
        balances: visibleBalances,
        isTestnetModeEnabled,
        currencyIdToTokenVisibility,
      })

    const pnlLookup = new Map<string, { avgCost: number; unrealizedPnl: number; unrealizedPnlPercent: number }>()
    if (tokenProfitLossData?.tokenProfitLosses) {
      for (const entry of tokenProfitLossData.tokenProfitLosses) {
        if (entry.token) {
          const key = `${entry.token.address.toLowerCase()}-${entry.token.chainId}`
          pnlLookup.set(key, {
            avgCost: entry.averageCostUsd,
            unrealizedPnl: entry.unrealizedReturnUsd,
            unrealizedPnlPercent: entry.unrealizedReturnPercent,
          })
        }
      }
    }

    const mapBalanceToTokenData = ({
      balance,
      chainTokensForRow,
      allocationFromTotal,
    }: {
      balance: PortfolioMultichainBalance
      chainTokensForRow: PortfolioChainBalance[]
      allocationFromTotal?: number
    }): TokenData | null => {
      if (chainTokensForRow.length === 0) {
        return null
      }
      const tokens: TokenData['tokens'] = chainTokensForRow
        .map((t) => ({
          chainId: t.chainId,
          currencyInfo: t.currencyInfo,
          quantity: t.quantity,
          valueUsd: t.valueUsd ?? 0,
          symbol: t.currencyInfo.currency.symbol,
          isHidden: t.isHidden,
        }))
        .sort((a, b) => b.valueUsd - a.valueUsd)
      const first = tokens[0]
      // useTransformTokenTableData already ensures that there is at least one token, but adding check for safety
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (!first) {
        throw new Error('Invariant violation: tokens array is empty')
      }
      const totalValue = chainTokensForRow.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0)
      const quantity = tokens.reduce((sum, t) => sum + t.quantity, 0)
      const price = quantity > 0 && totalValue > 0 ? totalValue / quantity : (balance.priceUsd ?? undefined)

      // currencyAddress() returns the legacy native address (0xeeee...) for native tokens,
      // but the backend returns the canonical zero address (0x0000...). Normalize for lookup.
      const rawAddr = currencyAddress(first.currencyInfo.currency).toLowerCase()
      const addr = first.currencyInfo.currency.isNative ? DEFAULT_NATIVE_ADDRESS : rawAddr
      const pnl = pnlLookup.get(`${addr}-${first.chainId}`)
      const isStablecoin = isStablecoinAddress(first.chainId as UniverseChainId, addr)

      return {
        id: balance.id,
        testId: `${TestID.TokenTableRowPrefix}${balance.id}`,
        chainId: first.chainId,
        currencyInfo: first.currencyInfo,
        name: balance.name,
        symbol: balance.symbol,
        quantity,
        price,
        tokens,
        totalValue,
        allocation: allocationFromTotal ?? 0,
        change1d: balance.pricePercentChange1d ?? undefined,
        avgCost: pnl?.avgCost,
        unrealizedPnl: pnl?.unrealizedPnl,
        unrealizedPnlPercent: pnl?.unrealizedPnlPercent,
        isStablecoin,
      }
    }

    const visible = visibleBalancePartitions
      .map(({ balance, visibleChainTokens }) => {
        if (visibleChainTokens.length === 0) {
          return null
        }
        const valueUSD = visibleChainTokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0)
        const allocation = totalUSDVisible > 0 ? (valueUSD / totalUSDVisible) * 100 : 0
        return mapBalanceToTokenData({
          balance,
          chainTokensForRow: visibleChainTokens,
          allocationFromTotal: allocation,
        })
      })
      .filter((d): d is TokenData => d !== null)

    const hiddenFromFullyHidden = hiddenBalancesFiltered.flatMap((b) =>
      flattenPortfolioMultichainBalanceToSingleChainRows(b)
        .map((flatBalance) =>
          mapBalanceToTokenData({
            balance: flatBalance,
            chainTokensForRow: flatBalance.tokens,
            allocationFromTotal: 0,
          }),
        )
        .filter((d): d is TokenData => d !== null),
    )

    const hiddenFromPartialVisible = visibleBalancePartitions.flatMap(({ balance, hiddenChainTokens }) =>
      hiddenChainTokens
        .map((ht) =>
          mapBalanceToTokenData({
            balance,
            chainTokensForRow: [ht],
            allocationFromTotal: 0,
          }),
        )
        .filter((d): d is TokenData => d !== null),
    )

    // Per-chain hidden rows from still-visible multichain assets first, then fully hidden (flattened or single-chain).
    const hidden = [...hiddenFromPartialVisible, ...hiddenFromFullyHidden]

    // Apply limit to visible tokens if specified
    const limitedVisible = limit ? visible.slice(0, limit) : visible
    const totalCount = visible.length

    return {
      visible: limitedVisible,
      hidden,
      totalCount,
      loading,
      refetching: isRefetching,
      refetch,
      networkStatus,
      error,
    }
  }, [
    loading,
    sortedBalances,
    error,
    refetch,
    networkStatus,
    limit,
    tokenProfitLossData,
    isTestnetModeEnabled,
    currencyIdToTokenVisibility,
  ])
}

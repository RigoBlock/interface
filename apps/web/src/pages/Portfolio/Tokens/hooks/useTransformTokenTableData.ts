import type { PlainMessage } from '@bufbuild/protobuf'
import { GetWalletTokensProfitLossResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { UniverseChainId } from '@universe/chains'
import { TestID } from '@universe/test'
import { useMemo } from 'react'
import { HYPERLIQUID_LOGO } from 'ui/src/assets'
import { USDC_HYPEREVM } from 'uniswap/src/constants/tokens'
import { DEFAULT_NATIVE_ADDRESS } from 'uniswap/src/features/chains/evm/rpc'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { isStablecoinAddress } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import type { PortfolioChainBalance, PortfolioMultichainBalance } from 'uniswap/src/features/dataApi/types'
import { buildCurrencyInfo } from 'uniswap/src/features/dataApi/utils/buildCurrency'
import { useEarnVaults } from 'uniswap/src/features/earn/hooks/useEarnVaults'
import {
  flattenPortfolioMultichainBalanceToSingleChainRows,
  partitionMultichainBalancesByPerChainVisibility,
} from 'uniswap/src/features/portfolio/balances/buildExtensionMultichainBalancesListData'
import { useSortedPortfolioBalancesMultichain } from 'uniswap/src/features/portfolio/balances/hooks'
import { useCurrencyIdToVisibility } from 'uniswap/src/features/transactions/selectors'
import { normalizeCurrencyIdForMapLookup } from 'uniswap/src/utils/currencyId'
import { buildCurrencyId, currencyAddress, currencyId } from 'uniswap/src/utils/currencyId'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'
import {
  buildPnlLookupsFromProfitLoss,
  pnlLookupKeyFromPortfolioChainBalance,
  resolveAggregatedPnlForChainTokens,
} from '~/pages/Portfolio/Tokens/hooks/portfolioTokenTablePnl'

/** Per-chain token instance (use TokenData['tokens'][number] in other modules) */
interface TokenDataToken {
  chainId: number
  currencyInfo: CurrencyInfo
  quantity: number
  valueUsd: number
  symbol: string | undefined
  isHidden: boolean | null | undefined
  avgCost?: number
  unrealizedPnl?: number
  unrealizedPnlPercent?: number
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
  isMultichainAsset: boolean
  totalValue: number
  allocation: number
  avgCost?: number
  unrealizedPnl?: number
  unrealizedPnlPercent?: number
  isStablecoin: boolean
  /** Spam-flagged token in the hidden section: value and P&L cells render as "-". */
  isSpamHidden?: boolean
}

function filterVaultShareTokens({
  balance,
  vaultShareCurrencyIds,
}: {
  balance: PortfolioMultichainBalance
  vaultShareCurrencyIds: Set<string>
}): PortfolioMultichainBalance {
  if (vaultShareCurrencyIds.size === 0) {
    return balance
  }

  const tokens = balance.tokens.filter((token) => {
    const tokenCurrencyId = normalizeCurrencyIdForMapLookup(currencyId(token.currencyInfo.currency))
    return !vaultShareCurrencyIds.has(tokenCurrencyId)
  })

  return tokens.length === balance.tokens.length ? balance : { ...balance, tokens }
}

/** Insert a balance into a value-sorted balance list, preserving descending order. */
function insertBalanceSortedByValue(
  balances: PortfolioMultichainBalance[],
  balance: PortfolioMultichainBalance,
): PortfolioMultichainBalance[] {
  const value = balance.totalValueUsd ?? 0
  const index = balances.findIndex((b) => (b.totalValueUsd ?? 0) < value)
  const insertionIndex = index === -1 ? balances.length : index
  return [...balances.slice(0, insertionIndex), balance, ...balances.slice(insertionIndex)]
}

/** Whether a multichain row is the USDC row that should absorb the HyperEVM USDC chain entry */
function isMergeableUsdcRow(balance: PortfolioMultichainBalance): boolean {
  return (
    balance.symbol.toUpperCase() === 'USDC' &&
    !balance.tokens.some((token) => token.chainId === UniverseChainId.HyperEvm)
  )
}

export function useTransformTokenTableData({
  chainIds,
  limit,
  tokenProfitLossData,
}: {
  chainIds?: UniverseChainId[]
  limit?: number
  tokenProfitLossData?: PlainMessage<GetWalletTokensProfitLossResponse>
}): {
  visible: TokenData[] | null
  hidden: TokenData[] | null
  totalCount: number | null
  loading: boolean
  refetching: boolean
  error: Error | undefined
  refetch: (() => void) | undefined
} {
  const { evmAddress, svmAddress } = usePortfolioAddresses()
  const ownerAddresses = useMemo(
    () => [evmAddress, svmAddress].filter((a): a is Address => !!a),
    [evmAddress, svmAddress],
  )
  const currencyIdToTokenVisibility = useCurrencyIdToVisibility(ownerAddresses)
  const { isTestnetModeEnabled } = useEnabledChains()
  const { isLoadingVaults, vaults } = useEarnVaults()
  const vaultShareCurrencyIds = useMemo(
    () =>
      new Set(
        vaults.map((vault) => normalizeCurrencyIdForMapLookup(buildCurrencyId(vault.chainId, vault.vaultAddress))),
      ),
    [vaults],
  )

  const {
    data: sortedBalances,
    loading,
    error,
    refetch,
    isPending,
  } = useSortedPortfolioBalancesMultichain({
    evmAddress,
    svmAddress,
    chainIds,
    requestMultichainFromBackend: true,
  })

  // HyperEVM (chain 999) is not indexed by the Uniswap data API, so the vault's HyperEVM USDC
  // balance is read on-chain and injected here as a synthetic multichain balance row.
  const { balanceUsd: hyperEvmUsdcBalanceUsd } = useHyperEvmUsdcBalance(evmAddress)

  const hyperliquidUsdcBalance = useMemo((): PortfolioMultichainBalance | null => {
    if (!hyperEvmUsdcBalanceUsd || hyperEvmUsdcBalanceUsd <= 0) {
      return null
    }
    const currencyInfo = buildCurrencyInfo({
      currency: USDC_HYPEREVM,
      currencyId: currencyId(USDC_HYPEREVM),
      logoUrl: HYPERLIQUID_LOGO,
      isSpam: false,
    })
    const chainToken: PortfolioChainBalance = {
      chainId: UniverseChainId.HyperEvm,
      address: USDC_HYPEREVM.address,
      decimals: USDC_HYPEREVM.decimals,
      quantity: hyperEvmUsdcBalanceUsd,
      valueUsd: hyperEvmUsdcBalanceUsd,
      isHidden: false,
      currencyInfo,
    }
    return {
      id: currencyInfo.currencyId,
      cacheId: `TokenBalance:${UniverseChainId.HyperEvm}-${USDC_HYPEREVM.address}-${evmAddress ?? ''}`,
      name: USDC_HYPEREVM.name ?? 'USD Coin',
      symbol: USDC_HYPEREVM.symbol ?? 'USDC',
      logoUrl: HYPERLIQUID_LOGO,
      totalAmount: hyperEvmUsdcBalanceUsd,
      priceUsd: 1,
      pricePercentChange1d: null,
      totalValueUsd: hyperEvmUsdcBalanceUsd,
      isHidden: false,
      tokens: [chainToken],
    }
  }, [hyperEvmUsdcBalanceUsd, evmAddress])

  return useMemo(() => {
    // Only show empty state on initial load, not during refetch.
    // 'pending' means the query has never completed.
    // This is synchronously true from the very first render when there is no cached data, even before isFetching is set.
    const isInitialLoading = (isPending && !sortedBalances) || isLoadingVaults
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
        }
      }
      return { visible: [], hidden: [], totalCount: 0, loading, refetching: false, error, refetch }
    }

    const balancesWithTokens = (balances: PortfolioMultichainBalance[]): PortfolioMultichainBalance[] =>
      balances
        .map((balance) => filterVaultShareTokens({ balance, vaultShareCurrencyIds }))
        .filter((b) => b.tokens.length > 0)

    // Only inject the HyperEVM USDC row when no per-chain filter is active or HyperEVM is selected
    const allBalances = sortedBalances.balances
    const balances = ((): PortfolioMultichainBalance[] => {
      if (!hyperliquidUsdcBalance || (chainIds && !chainIds.includes(UniverseChainId.HyperEvm))) {
        return allBalances
      }
      // Group with the existing multichain USDC row when one exists, so HyperEVM USDC
      // shows as another chain entry on the same row rather than a duplicate USDC line
      const usdcRowIndex = allBalances.findIndex(isMergeableUsdcRow)
      if (usdcRowIndex === -1) {
        return insertBalanceSortedByValue(allBalances, hyperliquidUsdcBalance)
      }
      const usdcRow = allBalances[usdcRowIndex]
      const merged: PortfolioMultichainBalance = {
        ...usdcRow,
        tokens: [...usdcRow.tokens, ...hyperliquidUsdcBalance.tokens],
        totalAmount: usdcRow.totalAmount + hyperliquidUsdcBalance.totalAmount,
        totalValueUsd: (usdcRow.totalValueUsd ?? 0) + (hyperliquidUsdcBalance.totalValueUsd ?? 0),
      }
      const next = [...allBalances]
      next[usdcRowIndex] = merged
      return next
    })()

    const visibleBalances = balancesWithTokens(balances)
    const hiddenBalancesFiltered = balancesWithTokens(sortedBalances.hiddenBalances)

    const { partitions: visibleBalancePartitions, totalUsdVisible: totalUSDVisible } =
      partitionMultichainBalancesByPerChainVisibility({
        balances: visibleBalances,
        isTestnetModeEnabled,
        currencyIdToTokenVisibility,
      })

    const { perChainPnlLookup, aggregatedJoinByLegKey } = buildPnlLookupsFromProfitLoss(tokenProfitLossData)

    const mapBalanceToTokenData = ({
      balance,
      chainTokensForRow,
      allocationFromTotal,
      /** Fully hidden multichain rows are flattened to one synthetic balance per leg (`tokens.length === 1`); set from the parent when that still represents a multichain asset. */
      isMultichainAssetOverride,
      isHiddenRow = false,
    }: {
      balance: PortfolioMultichainBalance
      chainTokensForRow: PortfolioChainBalance[]
      allocationFromTotal?: number
      isMultichainAssetOverride?: boolean
      isHiddenRow?: boolean
    }): TokenData | null => {
      if (chainTokensForRow.length === 0) {
        return null
      }
      const tokens: TokenData['tokens'] = chainTokensForRow
        .map((t) => {
          const rawAddr = currencyAddress(t.currencyInfo.currency).toLowerCase()
          const addr = t.currencyInfo.currency.isNative ? DEFAULT_NATIVE_ADDRESS : rawAddr
          const pnl = perChainPnlLookup.get(pnlLookupKeyFromPortfolioChainBalance(t))
          const isStableOnChain = isStablecoinAddress(t.chainId as UniverseChainId, addr)
          return {
            chainId: t.chainId,
            currencyInfo: t.currencyInfo,
            quantity: t.quantity,
            valueUsd: t.valueUsd ?? 0,
            symbol: t.currencyInfo.currency.symbol,
            isHidden: t.isHidden,
            avgCost: pnl?.avgCost,
            unrealizedPnl: isStableOnChain ? undefined : pnl?.unrealizedPnl,
            unrealizedPnlPercent: isStableOnChain ? undefined : pnl?.unrealizedPnlPercent,
          }
        })
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

      const rawAddrFirst = currencyAddress(first.currencyInfo.currency).toLowerCase()
      const addrFirst = first.currencyInfo.currency.isNative ? DEFAULT_NATIVE_ADDRESS : rawAddrFirst
      const isStablecoin = isStablecoinAddress(first.chainId as UniverseChainId, addrFirst)

      const aggregatedPnl = resolveAggregatedPnlForChainTokens(chainTokensForRow, aggregatedJoinByLegKey)

      const parentAvgCost = aggregatedPnl?.avgCost ?? first.avgCost
      const parentUnrealizedPnl = isStablecoin ? undefined : (aggregatedPnl?.unrealizedPnl ?? first.unrealizedPnl)
      const parentUnrealizedPnlPercent = isStablecoin
        ? undefined
        : (aggregatedPnl?.unrealizedPnlPercent ?? first.unrealizedPnlPercent)

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
        isMultichainAsset: isMultichainAssetOverride ?? balance.tokens.length > 1,
        totalValue,
        allocation: allocationFromTotal ?? 0,
        change1d: balance.pricePercentChange1d ?? undefined,
        avgCost: parentAvgCost,
        unrealizedPnl: parentUnrealizedPnl,
        unrealizedPnlPercent: parentUnrealizedPnlPercent,
        isStablecoin,
        // Hidden rows are single-chain, so `first` is the row's chain token
        isSpamHidden: isHiddenRow && !!first.currencyInfo.isSpam,
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

    const hiddenFromFullyHidden = hiddenBalancesFiltered.flatMap((b) => {
      const parentWasMultichain = b.tokens.length > 1
      return flattenPortfolioMultichainBalanceToSingleChainRows(b)
        .map((flatBalance) =>
          mapBalanceToTokenData({
            balance: flatBalance,
            chainTokensForRow: flatBalance.tokens,
            allocationFromTotal: 0,
            isMultichainAssetOverride: parentWasMultichain,
            isHiddenRow: true,
          }),
        )
        .filter((d): d is TokenData => d !== null)
    })

    const hiddenFromPartialVisible = visibleBalancePartitions.flatMap(({ balance, hiddenChainTokens }) =>
      hiddenChainTokens
        .map((ht) =>
          mapBalanceToTokenData({
            balance,
            chainTokensForRow: [ht],
            allocationFromTotal: 0,
            isHiddenRow: true,
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
      error,
    }
  }, [
    loading,
    sortedBalances,
    error,
    refetch,
    limit,
    tokenProfitLossData,
    isTestnetModeEnabled,
    currencyIdToTokenVisibility,
    hyperliquidUsdcBalance,
    chainIds,
    isLoadingVaults,
    vaultShareCurrencyIds,
    isPending,
  ])
}

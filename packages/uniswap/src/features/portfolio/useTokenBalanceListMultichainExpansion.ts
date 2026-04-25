import isEqual from 'lodash/isEqual'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { PortfolioMultichainBalance } from 'uniswap/src/features/dataApi/types'
import { sortPortfolioChainBalances } from 'uniswap/src/features/portfolio/balances/sortPortfolioBalances'
import type { SortedPortfolioBalancesMultichain } from 'uniswap/src/features/portfolio/balances/types'
import { HIDDEN_TOKEN_BALANCES_ROW, makeChainRowId, TokenBalanceListRow } from 'uniswap/src/features/portfolio/types'
import { CurrencyId } from 'uniswap/src/types/currency'
import { isExtensionApp } from 'utilities/src/platform'

/**
 * Builds token balance list row ids, optionally inserting per-chain child rows when a multichain
 * balance is expanded. Child rows and toggle state only apply when {@link isExtensionApp} is true
 * (browser extension); the mobile app always gets a flat list of parent rows only.
 */
export function useTokenBalanceListMultichainExpansion({
  sortedData,
  hiddenTokensExpanded,
}: {
  sortedData: SortedPortfolioBalancesMultichain | undefined
  hiddenTokensExpanded: boolean
}): {
  rows: TokenBalanceListRow[]
  expandedCurrencyIds: Set<string>
  toggleExpanded: (currencyId: string) => void
  multichainRowExpansionEnabled: boolean
} {
  const multichainRowExpansionEnabled = isExtensionApp
  const { isTestnetModeEnabled } = useEnabledChains()

  const [expandedCurrencyIds, setExpandedCurrencyIds] = useState<Set<string>>(() => new Set())

  const toggleExpanded = useCallback(
    (currencyId: string) => {
      if (!multichainRowExpansionEnabled) {
        return
      }
      setExpandedCurrencyIds((prev) => {
        const next = new Set(prev)
        if (next.has(currencyId)) {
          next.delete(currencyId)
        } else {
          next.add(currencyId)
        }
        return next
      })
    },
    [multichainRowExpansionEnabled],
  )

  const rowsRef = useRef<TokenBalanceListRow[]>(undefined)

  const rows = useMemo((): TokenBalanceListRow[] => {
    if (!sortedData) {
      return []
    }

    const buildRowIdsForBalances = (balances: PortfolioMultichainBalance[]): TokenBalanceListRow[] => {
      const result: TokenBalanceListRow[] = []
      for (const balance of balances) {
        const currencyId = balance.id
        result.push(currencyId)
        if (multichainRowExpansionEnabled && balance.tokens.length > 1 && expandedCurrencyIds.has(currencyId)) {
          const orderedTokens = sortPortfolioChainBalances({
            tokens: balance.tokens,
            isTestnetModeEnabled,
          })
          for (const t of orderedTokens) {
            result.push(makeChainRowId(currencyId as CurrencyId, t.chainId))
          }
        }
      }
      return result
    }

    const shownRowIds = buildRowIdsForBalances(sortedData.balances)
    const hiddenBalances = sortedData.hiddenBalances
    const newRowIds: TokenBalanceListRow[] = [
      ...shownRowIds,
      ...(hiddenBalances.length ? [HIDDEN_TOKEN_BALANCES_ROW] : []),
      ...(hiddenTokensExpanded ? buildRowIdsForBalances(hiddenBalances) : []),
    ]

    if (!rowsRef.current || !isEqual(rowsRef.current, newRowIds)) {
      rowsRef.current = newRowIds
    }
    return rowsRef.current
  }, [sortedData, hiddenTokensExpanded, expandedCurrencyIds, multichainRowExpansionEnabled, isTestnetModeEnabled])

  return {
    rows,
    expandedCurrencyIds,
    toggleExpanded,
    multichainRowExpansionEnabled,
  }
}

import { CurrencyId } from 'uniswap/src/types/currency'

export const HIDDEN_TOKEN_BALANCES_ROW = 'HIDDEN_TOKEN_BALANCES_ROW' as const

const CHAIN_ROW_PREFIX = 'chain:'

export function isHiddenTokenBalancesRow(row: string): row is typeof HIDDEN_TOKEN_BALANCES_ROW {
  return row === HIDDEN_TOKEN_BALANCES_ROW
}

export function isChainRowId(row: string): boolean {
  return row.startsWith(CHAIN_ROW_PREFIX)
}

/**
 * Parses `makeChainRowId` strings. Uses the last `:` as delimiter so `currencyId`
 * (e.g. `1-0x…`) may contain hyphens but must not contain `:`.
 */
export function parseChainRowId(row: string): { currencyId: CurrencyId; chainId: number } {
  const rest = row.slice(CHAIN_ROW_PREFIX.length)
  const lastColon = rest.lastIndexOf(':')
  const currencyId = rest.slice(0, lastColon) as CurrencyId
  const chainId = Number.parseInt(rest.slice(lastColon + 1), 10)
  return { currencyId, chainId }
}

export function makeChainRowId(currencyId: CurrencyId, chainId: number): string {
  return `${CHAIN_ROW_PREFIX}${currencyId}:${chainId}`
}

export type TokenBalanceListRow = CurrencyId | typeof HIDDEN_TOKEN_BALANCES_ROW

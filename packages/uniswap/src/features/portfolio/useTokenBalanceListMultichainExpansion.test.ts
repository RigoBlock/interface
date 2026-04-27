import { act, renderHook } from '@testing-library/react'
import type { PortfolioChainBalance } from 'uniswap/src/features/dataApi/types'
import type { SortedPortfolioBalancesMultichain } from 'uniswap/src/features/portfolio/balances/types'
import { HIDDEN_TOKEN_BALANCES_ROW, makeChainRowId } from 'uniswap/src/features/portfolio/types'
import {
  createPortfolioChainBalance,
  createPortfolioMultichainBalance,
} from 'uniswap/src/test/fixtures/dataApi/portfolioMultichainBalances'
import type { CurrencyId } from 'uniswap/src/types/currency'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTokenBalanceListMultichainExpansion } from './useTokenBalanceListMultichainExpansion'

const CHAIN_ID_MAINNET = 1
const CHAIN_ID_ARBITRUM = 42161

/** Distinct dummy token addresses (hex pattern mnemonics). */
const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const currencyIdOnChain = (chainId: number, address: string): string => `${chainId}-${address}`

const platformState = vi.hoisted(() => ({ isExtensionApp: false }))

vi.mock('utilities/src/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('utilities/src/platform')>()
  return {
    ...actual,
    get isExtensionApp() {
      return platformState.isExtensionApp
    },
  }
})

vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: (): { isTestnetModeEnabled: boolean } => ({ isTestnetModeEnabled: false }),
}))

function makeSortedData(overrides: Partial<SortedPortfolioBalancesMultichain> = {}): SortedPortfolioBalancesMultichain {
  return {
    balances: [],
    hiddenBalances: [],
    ...overrides,
  }
}

describe(useTokenBalanceListMultichainExpansion, () => {
  beforeEach(() => {
    platformState.isExtensionApp = false
  })

  it('returns empty rows when sortedData is undefined', () => {
    const { result } = renderHook(() =>
      useTokenBalanceListMultichainExpansion({ sortedData: undefined, hiddenTokensExpanded: false }),
    )
    expect(result.current.rows).toEqual([])
    expect(result.current.expandedCurrencyIds.size).toBe(0)
    expect(result.current.multichainRowExpansionEnabled).toBe(false)
  })

  it('lists parent balance ids only for single-chain balances', () => {
    const b = createPortfolioMultichainBalance({ id: 'single-asset' })
    const sortedData = makeSortedData({ balances: [b] })
    const { result } = renderHook(() =>
      useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
    )
    expect(result.current.rows).toEqual(['single-asset'])
  })

  it('appends hidden section row when there are hidden balances', () => {
    const hidden = createPortfolioMultichainBalance({ id: 'hidden-1' })
    const sortedData = makeSortedData({
      balances: [],
      hiddenBalances: [hidden],
    })
    const { result } = renderHook(() =>
      useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
    )
    expect(result.current.rows).toEqual([HIDDEN_TOKEN_BALANCES_ROW])
  })

  it('includes hidden balance rows after the hidden section row when hiddenTokensExpanded is true', () => {
    const hidden = createPortfolioMultichainBalance({ id: 'hidden-1' })
    const sortedData = makeSortedData({
      balances: [],
      hiddenBalances: [hidden],
    })
    const { result } = renderHook(() =>
      useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: true }),
    )
    expect(result.current.rows).toEqual([HIDDEN_TOKEN_BALANCES_ROW, 'hidden-1'])
  })

  describe('when multichain row expansion is enabled (extension)', () => {
    beforeEach(() => {
      platformState.isExtensionApp = true
    })

    it('reports multichainRowExpansionEnabled true', () => {
      const { result } = renderHook(() =>
        useTokenBalanceListMultichainExpansion({
          sortedData: makeSortedData(),
          hiddenTokensExpanded: false,
        }),
      )
      expect(result.current.multichainRowExpansionEnabled).toBe(true)
    })

    it('does not insert per-chain rows until the parent is expanded', () => {
      const tHigh = createPortfolioChainBalance({
        chainId: CHAIN_ID_MAINNET,
        valueUsd: 200,
        currencyInfo: {
          currencyId: currencyIdOnChain(CHAIN_ID_MAINNET, ADDR_A),
          currency: {
            chainId: CHAIN_ID_MAINNET,
            address: ADDR_A,
            isToken: true,
            symbol: 'A',
            name: 'A',
            isNative: false,
          } as PortfolioChainBalance['currencyInfo']['currency'],
          logoUrl: undefined,
        },
      })
      const tLow = createPortfolioChainBalance({
        chainId: CHAIN_ID_ARBITRUM,
        valueUsd: 50,
        address: ADDR_B,
        currencyInfo: {
          currencyId: currencyIdOnChain(CHAIN_ID_ARBITRUM, ADDR_B),
          currency: {
            chainId: CHAIN_ID_ARBITRUM,
            address: ADDR_B,
            isToken: true,
            symbol: 'B',
            name: 'B',
            isNative: false,
          } as PortfolioChainBalance['currencyInfo']['currency'],
          logoUrl: undefined,
        },
      })
      const mc = createPortfolioMultichainBalance({
        id: 'mc-parent',
        tokens: [tLow, tHigh],
      })
      const sortedData = makeSortedData({ balances: [mc] })

      const { result } = renderHook(() =>
        useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
      )

      expect(result.current.rows).toEqual(['mc-parent'])
    })

    it('inserts per-chain rows in valueUsd order after toggleExpanded', () => {
      const tHigh = createPortfolioChainBalance({
        chainId: CHAIN_ID_MAINNET,
        valueUsd: 200,
        currencyInfo: {
          currencyId: currencyIdOnChain(CHAIN_ID_MAINNET, ADDR_A),
          currency: {
            chainId: CHAIN_ID_MAINNET,
            address: ADDR_A,
            isToken: true,
            symbol: 'A',
            name: 'A',
            isNative: false,
          } as PortfolioChainBalance['currencyInfo']['currency'],
          logoUrl: undefined,
        },
      })
      const tLow = createPortfolioChainBalance({
        chainId: CHAIN_ID_ARBITRUM,
        valueUsd: 50,
        address: ADDR_B,
        currencyInfo: {
          currencyId: currencyIdOnChain(CHAIN_ID_ARBITRUM, ADDR_B),
          currency: {
            chainId: CHAIN_ID_ARBITRUM,
            address: ADDR_B,
            isToken: true,
            symbol: 'B',
            name: 'B',
            isNative: false,
          } as PortfolioChainBalance['currencyInfo']['currency'],
          logoUrl: undefined,
        },
      })
      const parentId = 'mc-parent' as CurrencyId
      const mc = createPortfolioMultichainBalance({
        id: parentId,
        tokens: [tLow, tHigh],
      })
      const sortedData = makeSortedData({ balances: [mc] })

      const { result } = renderHook(() =>
        useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
      )

      act(() => {
        result.current.toggleExpanded(parentId)
      })

      expect(result.current.expandedCurrencyIds.has(parentId)).toBe(true)
      expect(result.current.rows).toEqual([
        parentId,
        makeChainRowId(parentId, CHAIN_ID_MAINNET),
        makeChainRowId(parentId, CHAIN_ID_ARBITRUM),
      ])

      act(() => {
        result.current.toggleExpanded(parentId)
      })

      expect(result.current.expandedCurrencyIds.has(parentId)).toBe(false)
      expect(result.current.rows).toEqual([parentId])
    })

    it('does not add per-chain rows for multichain balances with only one token even when expanded', () => {
      const b = createPortfolioMultichainBalance({ id: 'one-chain' })
      const sortedData = makeSortedData({ balances: [b] })
      const { result } = renderHook(() =>
        useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
      )

      act(() => {
        result.current.toggleExpanded('one-chain')
      })

      expect(result.current.rows).toEqual(['one-chain'])
    })
  })

  describe('when multichain row expansion is disabled (non-extension)', () => {
    it('toggleExpanded does not expand currency ids or add chain rows', () => {
      platformState.isExtensionApp = false
      const t1 = createPortfolioChainBalance({ chainId: CHAIN_ID_MAINNET, valueUsd: 100 })
      const t2 = createPortfolioChainBalance({
        chainId: CHAIN_ID_ARBITRUM,
        valueUsd: 10,
        address: ADDR_B,
        currencyInfo: {
          currencyId: currencyIdOnChain(CHAIN_ID_ARBITRUM, ADDR_B),
          currency: {
            chainId: CHAIN_ID_ARBITRUM,
            address: ADDR_B,
            isToken: true,
            symbol: 'B',
            name: 'B',
            isNative: false,
          } as PortfolioChainBalance['currencyInfo']['currency'],
          logoUrl: undefined,
        },
      })
      const mc = createPortfolioMultichainBalance({ id: 'mc-parent', tokens: [t1, t2] })
      const sortedData = makeSortedData({ balances: [mc] })

      const { result } = renderHook(() =>
        useTokenBalanceListMultichainExpansion({ sortedData, hiddenTokensExpanded: false }),
      )

      act(() => {
        result.current.toggleExpanded('mc-parent')
      })

      expect(result.current.expandedCurrencyIds.size).toBe(0)
      expect(result.current.rows).toEqual(['mc-parent'])
    })
  })
})

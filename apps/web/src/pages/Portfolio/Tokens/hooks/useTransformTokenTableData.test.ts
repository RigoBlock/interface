import { NetworkStatus } from '@apollo/client'
import { Token } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type {
  CurrencyInfo,
  PortfolioChainBalance,
  PortfolioMultichainBalance,
} from 'uniswap/src/features/dataApi/types'
import { useSortedPortfolioBalancesMultichain } from 'uniswap/src/features/portfolio/balances/hooks'
import {
  createPortfolioChainBalance,
  createPortfolioMultichainBalance,
} from 'uniswap/src/test/fixtures/dataApi/portfolioMultichainBalances'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { describe, expect, it, vi } from 'vitest'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { useTransformTokenTableData } from '~/pages/Portfolio/Tokens/hooks/useTransformTokenTableData'
import { TEST_TOKEN_1_INFO, TEST_TOKEN_2_INFO } from '~/test-utils/constants'
import { renderHook } from '~/test-utils/render'
import { assume0xAddress } from '~/utils/wagmi'

vi.mock('~/pages/Portfolio/hooks/usePortfolioAddresses', () => ({
  usePortfolioAddresses: vi.fn(),
}))

vi.mock('@universe/gating', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: vi.fn().mockReturnValue(false),
  FeatureFlags: { MultichainTokenUx: 'multichain_token_ux' },
}))

vi.mock('uniswap/src/features/portfolio/balances/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('uniswap/src/features/portfolio/balances/hooks')>()
  return {
    ...actual,
    useSortedPortfolioBalancesMultichain: vi.fn(),
  }
})

const mockUsePortfolioAddresses = vi.mocked(usePortfolioAddresses)
const mockUseSortedPortfolioBalancesMultichain = vi.mocked(useSortedPortfolioBalancesMultichain)

/** Web-only preset around shared {@link createPortfolioChainBalance} (quantity/valueUsd for token table tests). */
function createPortfolioTableChainBalance(
  currencyInfo: CurrencyInfo,
  overrides: Partial<PortfolioChainBalance> = {},
): PortfolioChainBalance {
  const c = currencyInfo.currency
  const address = c instanceof Token ? c.address : '0x0000000000000000000000000000000000000001'
  return createPortfolioChainBalance({
    chainId: c.chainId,
    address,
    decimals: c.decimals,
    quantity: 100,
    valueUsd: 1000,
    isHidden: false,
    currencyInfo,
    ...overrides,
  })
}

/** Web-only preset around shared {@link createPortfolioMultichainBalance}. */
function createPortfolioTableMultichainBalance(
  currencyInfo: CurrencyInfo,
  overrides: Partial<PortfolioMultichainBalance> = {},
): PortfolioMultichainBalance {
  return createPortfolioMultichainBalance(
    {
      name: 'Test Token',
      symbol: 'TEST',
      logoUrl: null,
      totalAmount: 100,
      priceUsd: 10,
      pricePercentChange1d: null,
      totalValueUsd: 1000,
      isHidden: false,
      tokens: [createPortfolioTableChainBalance(currencyInfo)],
      ...overrides,
    },
    { cacheOwnerSuffix: '0xowner' },
  )
}

const createChainBalance = (overrides: Partial<PortfolioChainBalance> = {}): PortfolioChainBalance =>
  createPortfolioTableChainBalance(TEST_TOKEN_1_INFO, overrides)

const createMultichainBalance = (overrides: Partial<PortfolioMultichainBalance> = {}): PortfolioMultichainBalance =>
  createPortfolioTableMultichainBalance(TEST_TOKEN_1_INFO, overrides)

describe('useTransformTokenTableData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePortfolioAddresses.mockReturnValue({
      evmAddress: assume0xAddress('0xowner'),
      svmAddress: undefined,
      isExternalWallet: false,
    })
    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: undefined,
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: undefined,
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)
  })

  it('returns empty visible and hidden when no sorted balances', () => {
    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: undefined,
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: undefined,
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)

    const { result } = renderHook(() => useTransformTokenTableData({}))

    expect(result.current.visible).toEqual([])
    expect(result.current.hidden).toEqual([])
    expect(result.current.totalCount).toBe(0)
  })

  it('filters out balances with no tokens from visible', () => {
    const balanceWithTokens = createMultichainBalance({
      id: 'with-tokens',
      tokens: [createChainBalance()],
    })
    const balanceWithNoTokens = createMultichainBalance({
      id: 'no-tokens',
      tokens: [],
    })

    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: {
        balances: [balanceWithTokens, balanceWithNoTokens],
        hiddenBalances: [],
      },
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)

    const { result } = renderHook(() => useTransformTokenTableData({}))

    expect(result.current.visible).not.toBeNull()
    expect(result.current.visible).toHaveLength(1)
    expect(result.current.visible![0].id).toBe('with-tokens')
    expect(result.current.visible![0].tokens).toHaveLength(1)
  })

  it('filters out balances with no tokens from hidden', () => {
    const hiddenWithTokens = createMultichainBalance({
      id: 'hidden-with-tokens',
      tokens: [createChainBalance()],
    })
    const hiddenWithNoTokens = createMultichainBalance({
      id: 'hidden-no-tokens',
      tokens: [],
    })

    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: {
        balances: [],
        hiddenBalances: [hiddenWithTokens, hiddenWithNoTokens],
      },
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)

    const { result } = renderHook(() => useTransformTokenTableData({}))

    expect(result.current.hidden).not.toBeNull()
    expect(result.current.hidden).toHaveLength(1)
    expect(result.current.hidden![0].id).toBe('hidden-with-tokens')
    expect(result.current.hidden![0].tokens).toHaveLength(1)
  })

  it('flattens fully hidden multichain balances to one TokenData row per chain before table mapping', () => {
    const t1 = createPortfolioTableChainBalance(TEST_TOKEN_1_INFO, {
      chainId: UniverseChainId.Mainnet,
      quantity: 2,
      valueUsd: 10,
    })
    const t2 = createPortfolioTableChainBalance(TEST_TOKEN_2_INFO, {
      chainId: UniverseChainId.ArbitrumOne,
      quantity: 0,
      valueUsd: 0,
    })
    const hiddenMulti = createMultichainBalance({
      id: 'hidden-multi',
      priceUsd: 5,
      tokens: [t1, t2],
    })

    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: {
        balances: [],
        hiddenBalances: [hiddenMulti],
      },
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)

    const { result } = renderHook(() => useTransformTokenTableData({}))

    expect(result.current.hidden).not.toBeNull()
    expect(result.current.hidden).toHaveLength(2)
    for (const row of result.current.hidden!) {
      expect(row.tokens).toHaveLength(1)
    }

    const suffix1 = currencyId(TEST_TOKEN_1_INFO.currency)!
    expect(result.current.hidden![0]).toMatchObject({
      id: `hidden-multi-${suffix1}`,
      testId: `${TestID.TokenTableRowPrefix}hidden-multi-${suffix1}`,
      chainId: UniverseChainId.Mainnet,
      quantity: 2,
      price: 5,
      totalValue: 10,
    })
    expect(result.current.hidden![0]!.tokens[0]).toMatchObject({
      chainId: UniverseChainId.Mainnet,
      quantity: 2,
      valueUsd: 10,
      currencyInfo: TEST_TOKEN_1_INFO,
    })
    expect(result.current.hidden![1]).toMatchObject({
      chainId: UniverseChainId.ArbitrumOne,
      price: 5,
    })
    expect(result.current.hidden![1]!.tokens[0]).toMatchObject({
      chainId: UniverseChainId.ArbitrumOne,
      currencyInfo: TEST_TOKEN_2_INFO,
    })
  })

  it('every visible and hidden entry has tokens.length >= 1', () => {
    const balance1 = createMultichainBalance({ id: 'balance-1', tokens: [createChainBalance()] })
    const balance2 = createMultichainBalance({
      id: 'balance-2',
      tokens: [createChainBalance(), createChainBalance({ chainId: 42161 })],
    })

    mockUseSortedPortfolioBalancesMultichain.mockReturnValue({
      data: {
        balances: [balance1, balance2],
        hiddenBalances: [],
      },
      balancesById: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
      networkStatus: NetworkStatus.ready,
    } as ReturnType<typeof useSortedPortfolioBalancesMultichain>)

    const { result } = renderHook(() => useTransformTokenTableData({}))

    expect(result.current.visible).not.toBeNull()
    for (const row of result.current.visible!) {
      expect(row.tokens.length).toBeGreaterThanOrEqual(1)
      expect(row.tokens[0]).toBeDefined()
    }

    expect(result.current.hidden).not.toBeNull()
    for (const row of result.current.hidden!) {
      expect(row.tokens.length).toBeGreaterThanOrEqual(1)
      expect(row.tokens[0]).toBeDefined()
    }
  })
})

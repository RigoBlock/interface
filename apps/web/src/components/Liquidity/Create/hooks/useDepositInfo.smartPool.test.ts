import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { FeeAmount, nearestUsableTick, TICK_SPACINGS, TickMath } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { useDynamicConfigValue } from '@universe/gating'
import JSBI from 'jsbi'
import { USDT } from 'uniswap/src/constants/tokens'
import { normalizeCurrencyIdForMapLookup } from 'uniswap/src/data/cache'
import { useMaxAmountSpend } from 'uniswap/src/features/gas/hooks/useMaxAmountSpend'
import { useOnChainCurrencyBalance } from 'uniswap/src/features/portfolio/api'
import { usePortfolioBalances } from 'uniswap/src/features/portfolio/balances/hooks'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPriceWrapper'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { useDepositInfo } from '~/components/Liquidity/Create/hooks/useDepositInfo'
import { useNativeTokenPercentageBufferExperiment } from '~/components/Liquidity/Create/hooks/useNativeTokenPercentageBufferExperiment'
import { ETH_MAINNET } from '~/test-utils/constants'
import { renderHook } from '~/test-utils/render'
import { PositionField } from '~/types/position'

vi.mock('~/components/Liquidity/Create/hooks/useNativeTokenPercentageBufferExperiment', async (importOriginal) => ({
  ...(await importOriginal()),
  useNativeTokenPercentageBufferExperiment: vi.fn(),
}))

vi.mock('uniswap/src/features/portfolio/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useOnChainCurrencyBalance: vi.fn(),
}))

vi.mock('uniswap/src/features/portfolio/balances/hooks', async (importOriginal) => ({
  ...(await importOriginal()),
  usePortfolioBalances: vi.fn(),
}))

vi.mock('@universe/gating', async (importOriginal) => ({
  ...(await importOriginal()),
  useDynamicConfigValue: vi.fn(),
}))

vi.mock('uniswap/src/features/gas/hooks/useMaxAmountSpend', async (importOriginal) => ({
  ...(await importOriginal()),
  useMaxAmountSpend: vi.fn(),
}))

vi.mock('uniswap/src/features/transactions/hooks/useUSDCPriceWrapper', async (importOriginal) => ({
  ...(await importOriginal()),
  useUSDCValue: vi.fn(),
}))

const useDynamicConfigValueMock = vi.mocked(useDynamicConfigValue)
const useNativeTokenPercentageBufferExperimentMock = vi.mocked(useNativeTokenPercentageBufferExperiment)
const useOnChainCurrencyBalanceMock = vi.mocked(useOnChainCurrencyBalance)
const usePortfolioBalancesMock = vi.mocked(usePortfolioBalances)
const useMaxAmountSpendMock = vi.mocked(useMaxAmountSpend)
const useUSDCValueMock = vi.mocked(useUSDCValue)

function buildPortfolioBalance(currency: Currency, quantity: number) {
  return {
    id: 'test',
    cacheId: 'test',
    quantity,
    balanceUSD: quantity * 3000,
    currencyInfo: {
      currency,
      currencyId: currencyId(currency),
      logoUrl: '',
      isSpam: false,
      safetyInfo: null,
      spamCode: undefined,
    },
    relativeChange24: null,
    isHidden: false,
  }
}

describe('useDepositInfo smart pool balances', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useOnChainCurrencyBalanceMock.mockReturnValue({
      balance: undefined,
      isLoading: false,
      error: null,
    })

    useMaxAmountSpendMock.mockImplementation(({ currencyAmount }) => {
      if (currencyAmount) {
        return CurrencyAmount.fromRawAmount(currencyAmount.currency, currencyAmount.quotient)
      }
      return undefined
    })

    useDynamicConfigValueMock.mockReturnValue(1)
    useUSDCValueMock.mockReturnValue(null)
    useNativeTokenPercentageBufferExperimentMock.mockReturnValue(0)
  })

  it('uses portfolio balance for native and token when keyed by normalized currencyId', () => {
    const ethBalance = buildPortfolioBalance(ETH_MAINNET, 2)
    const usdtBalance = buildPortfolioBalance(USDT, 500)
    usePortfolioBalancesMock.mockReturnValue({
      data: {
        [normalizeCurrencyIdForMapLookup(currencyId(ETH_MAINNET))]: ethBalance,
        [normalizeCurrencyIdForMapLookup(currencyId(USDT))]: usdtBalance,
      },
      loading: false,
      error: undefined,
      refetch: () => {},
      networkStatus: 7,
      dataUpdatedAt: 0,
    })

    const pool = new V4Pool(
      ETH_MAINNET,
      USDT,
      FeeAmount.MEDIUM,
      TICK_SPACINGS[FeeAmount.MEDIUM],
      '0x0000000000000000000000000000000000000000',
      '4054976535745954444738484',
      '7201247293608325509',
      -197613,
    )

    const { result } = renderHook(() =>
      useDepositInfo({
        protocolVersion: ProtocolVersion.V4,
        address: '0x1234567890123456789012345678901234567890',
        token0: ETH_MAINNET,
        token1: USDT,
        exactField: PositionField.TOKEN0,
        exactAmounts: {
          [PositionField.TOKEN0]: '1',
          [PositionField.TOKEN1]: '',
        },
        poolOrPair: pool,
        tickLower: nearestUsableTick(TickMath.MIN_TICK, pool.tickSpacing),
        tickUpper: nearestUsableTick(TickMath.MAX_TICK, pool.tickSpacing),
        isSmartPool: true,
      }),
    )

    expect(result.current.currencyBalances?.[PositionField.TOKEN0]?.toExact()).toBe('2')
    expect(result.current.currencyBalances?.[PositionField.TOKEN1]?.toExact()).toBe('500')
  })

  it('uses portfolio balance for native when keyed by chainId-NATIVE placeholder', () => {
    const ethBalance = buildPortfolioBalance(ETH_MAINNET, 3)
    usePortfolioBalancesMock.mockReturnValue({
      data: {
        [`${ETH_MAINNET.chainId}-NATIVE`]: ethBalance,
      },
      loading: false,
      error: undefined,
      refetch: () => {},
      networkStatus: 7,
      dataUpdatedAt: 0,
    })

    const pool = new V4Pool(
      ETH_MAINNET,
      USDT,
      FeeAmount.MEDIUM,
      TICK_SPACINGS[FeeAmount.MEDIUM],
      '0x0000000000000000000000000000000000000000',
      '4054976535745954444738484',
      '7201247293608325509',
      -197613,
    )

    const { result } = renderHook(() =>
      useDepositInfo({
        protocolVersion: ProtocolVersion.V4,
        address: '0x1234567890123456789012345678901234567890',
        token0: ETH_MAINNET,
        token1: USDT,
        exactField: PositionField.TOKEN0,
        exactAmounts: {
          [PositionField.TOKEN0]: '1',
          [PositionField.TOKEN1]: '',
        },
        poolOrPair: pool,
        tickLower: nearestUsableTick(TickMath.MIN_TICK, pool.tickSpacing),
        tickUpper: nearestUsableTick(TickMath.MAX_TICK, pool.tickSpacing),
        isSmartPool: true,
      }),
    )

    expect(result.current.currencyBalances?.[PositionField.TOKEN0]?.toExact()).toBe('3')
  })

  it('falls back to on-chain balance when portfolio is empty', () => {
    usePortfolioBalancesMock.mockReturnValue({
      data: {},
      loading: false,
      error: undefined,
      refetch: () => {},
      networkStatus: 7,
      dataUpdatedAt: 0,
    })
    useOnChainCurrencyBalanceMock.mockImplementation((currency) => {
      if (!currency) {
        return { balance: undefined, isLoading: false, error: null }
      }
      return {
        balance: CurrencyAmount.fromRawAmount(
          currency,
          JSBI.multiply(JSBI.BigInt(10), JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(currency.decimals))),
        ),
        isLoading: false,
        error: null,
      }
    })

    const pool = new V4Pool(
      ETH_MAINNET,
      USDT,
      FeeAmount.MEDIUM,
      TICK_SPACINGS[FeeAmount.MEDIUM],
      '0x0000000000000000000000000000000000000000',
      '4054976535745954444738484',
      '7201247293608325509',
      -197613,
    )

    const { result } = renderHook(() =>
      useDepositInfo({
        protocolVersion: ProtocolVersion.V4,
        address: '0x1234567890123456789012345678901234567890',
        token0: ETH_MAINNET,
        token1: USDT,
        exactField: PositionField.TOKEN0,
        exactAmounts: {
          [PositionField.TOKEN0]: '1',
          [PositionField.TOKEN1]: '',
        },
        poolOrPair: pool,
        tickLower: nearestUsableTick(TickMath.MIN_TICK, pool.tickSpacing),
        tickUpper: nearestUsableTick(TickMath.MAX_TICK, pool.tickSpacing),
        isSmartPool: true,
      }),
    )

    expect(result.current.currencyBalances?.[PositionField.TOKEN0]?.toExact()).toBe('10')
  })
})

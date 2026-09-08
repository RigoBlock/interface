import { useQuery } from '@tanstack/react-query'
import { BigNumber } from '@ethersproject/bignumber'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { logger } from 'utilities/src/logger/logger'
import { HYPERLIQUID_BRIDGE_USDC } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'

const ACROSS_SUGGESTED_FEES_URL = 'https://app.across.to/api/suggested-fees'
const QUOTE_REFETCH_INTERVAL_MS = 30_000

export interface HyperliquidBridgeQuote {
  /** Across quote timestamp (seconds) — used as depositV3 quoteTimestamp. */
  quoteTimestamp: number
  /** Total relay fee in input token raw units (USDC 6dp). */
  totalRelayFeeRaw: BigNumber
  /** Total relay fee as a fraction of the input amount (basis points). */
  totalRelayFeeBps: number
  /** Output amount the solver must deliver, in output token raw units (before AIntents deductions). */
  outputAmountRaw: BigNumber
  estimatedFillTimeSec?: number
  isAmountTooLow: boolean
  maxDeposit?: string
}

interface AcrossSuggestedFeesResponse {
  timestamp?: string
  estimatedFillTimeSec?: number
  isAmountTooLow?: boolean
  totalRelayFee?: { pct?: string; total?: string }
  outputAmount?: string
  limits?: { maxDeposit?: string }
}

/**
 * Fetches an Across suggested-fees quote for a pool USDC bridge leg
 * (input/output USDC on the given chains, amount in raw input units).
 */
export function useHyperliquidBridgeQuote(params: {
  sourceChainId: UniverseChainId
  destinationChainId: UniverseChainId
  inputAmountRaw?: BigNumber
  enabled: boolean
}): { quote: HyperliquidBridgeQuote | undefined; isLoading: boolean; isError: boolean } {
  const { sourceChainId, destinationChainId, inputAmountRaw, enabled } = params

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'hyperliquidBridgeQuote',
      sourceChainId,
      destinationChainId,
      inputAmountRaw?.toString(),
    ],
    queryFn: async (): Promise<HyperliquidBridgeQuote> => {
      const inputToken = HYPERLIQUID_BRIDGE_USDC[sourceChainId]
      const outputToken = HYPERLIQUID_BRIDGE_USDC[destinationChainId]
      if (!inputToken || !outputToken || !inputAmountRaw) {
        throw new Error('Missing bridge token config')
      }

      const url = new URL(ACROSS_SUGGESTED_FEES_URL)
      url.searchParams.set('inputToken', inputToken.address)
      url.searchParams.set('outputToken', outputToken.address)
      url.searchParams.set('originChainId', String(sourceChainId))
      url.searchParams.set('destinationChainId', String(destinationChainId))
      url.searchParams.set('amount', inputAmountRaw.toString())
      url.searchParams.set('allowUnmatchedDecimals', 'true')

      const response = await fetch(url.toString())
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Across API error (${response.status}): ${body.slice(0, 200)}`)
      }

      const apiData = (await response.json()) as AcrossSuggestedFeesResponse
      const totalRelayFeeRaw = BigNumber.from(apiData.totalRelayFee?.total ?? '0')
      const outputAmountRaw = BigNumber.from(apiData.outputAmount ?? '0')
      const quoteTimestamp = Number(apiData.timestamp)
      if (!Number.isFinite(quoteTimestamp) || quoteTimestamp <= 0) {
        throw new Error('Across API returned an invalid quote timestamp')
      }

      logger.debug('useHyperliquidBridgeQuote', 'queryFn', 'Across quote received', {
        sourceChainId,
        destinationChainId,
        totalRelayFee: totalRelayFeeRaw.toString(),
        outputAmount: outputAmountRaw.toString(),
        quoteTimestamp,
      })

      return {
        quoteTimestamp,
        totalRelayFeeRaw,
        totalRelayFeeBps: inputAmountRaw.gt(0) ? totalRelayFeeRaw.mul(10_000).div(inputAmountRaw).toNumber() : 0,
        outputAmountRaw,
        estimatedFillTimeSec:
          typeof apiData.estimatedFillTimeSec === 'number' ? apiData.estimatedFillTimeSec : undefined,
        isAmountTooLow: apiData.isAmountTooLow === true,
        maxDeposit: apiData.limits?.maxDeposit ? String(apiData.limits.maxDeposit) : undefined,
      }
    },
    enabled: enabled && !!inputAmountRaw && inputAmountRaw.gt(0),
    refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
    retry: 1,
    staleTime: 10_000,
  })

  return { quote: data, isLoading, isError }
}

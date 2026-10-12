import type { PlainMessage } from '@bufbuild/protobuf'
import type { GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { describe, expect, it } from 'vitest'
import { synthesizeHyperEvmChartData } from '~/pages/Portfolio/Overview/hooks/synthesizeHyperEvmChartData'

const BASE_CHART: PlainMessage<GetPortfolioChartResponse> = {
  points: [{ timestamp: 100n, value: 5 }],
  tokens: [],
  pools: [],
  earn: [],
  beginAt: 100n,
  endAt: 200n,
}

const HISTORY = [
  { timestamp: 1000, valueUsd: 500 },
  { timestamp: 2000, valueUsd: 700 },
  { timestamp: 3000, valueUsd: 600 },
]

describe('synthesizeHyperEvmChartData', () => {
  it('returns the base chart data unchanged when it exists', () => {
    const result = synthesizeHyperEvmChartData({
      baseChartData: BASE_CHART,
      isSelectedChainBackendSupported: true,
      hyperliquidHistoryForChain: true,
      hyperliquidHistory: HISTORY,
      fallbackWindow: { startSec: 0, endSec: 10 },
    })
    expect(result).toBe(BASE_CHART)
  })

  it('returns undefined for a backend-supported chain without base data', () => {
    const result = synthesizeHyperEvmChartData({
      baseChartData: undefined,
      isSelectedChainBackendSupported: true,
      hyperliquidHistoryForChain: false,
      hyperliquidHistory: [],
      fallbackWindow: undefined,
    })
    expect(result).toBeUndefined()
  })

  it('builds a zero-valued base on the history timestamps for a non-backend-supported chain', () => {
    const result = synthesizeHyperEvmChartData({
      baseChartData: undefined,
      isSelectedChainBackendSupported: false,
      hyperliquidHistoryForChain: true,
      hyperliquidHistory: HISTORY,
      fallbackWindow: { startSec: 0, endSec: 10 },
    })
    expect(result?.points).toEqual([
      { timestamp: 1000n, value: 0 },
      { timestamp: 2000n, value: 0 },
      { timestamp: 3000n, value: 0 },
    ])
    expect(result?.beginAt).toBe(1000n)
    expect(result?.endAt).toBe(3000n)
    expect(result?.tokens).toEqual([])
    expect(result?.pools).toEqual([])
    expect(result?.earn).toEqual([])
  })

  it('falls back to a flat two-point window when history is empty or not chain-attributable', () => {
    for (const hyperliquidHistoryForChain of [false, true]) {
      const result = synthesizeHyperEvmChartData({
        baseChartData: undefined,
        isSelectedChainBackendSupported: false,
        hyperliquidHistoryForChain,
        hyperliquidHistory: [],
        fallbackWindow: { startSec: 111, endSec: 222 },
      })
      expect(result?.points).toEqual([
        { timestamp: 111n, value: 0 },
        { timestamp: 222n, value: 0 },
      ])
      expect(result?.beginAt).toBe(111n)
      expect(result?.endAt).toBe(222n)
    }
  })

  it('returns undefined without a fallback window when no history exists', () => {
    const result = synthesizeHyperEvmChartData({
      baseChartData: undefined,
      isSelectedChainBackendSupported: false,
      hyperliquidHistoryForChain: false,
      hyperliquidHistory: [],
      fallbackWindow: undefined,
    })
    expect(result).toBeUndefined()
  })
})

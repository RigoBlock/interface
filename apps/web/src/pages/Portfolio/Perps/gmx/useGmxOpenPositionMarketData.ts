import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { PollingInterval } from 'uniswap/src/constants/misc'

const GMX_MARKET_INFO_URL = 'https://arbitrum-api.gmxinfra.io/markets/info'
const GMX_PRICES_URL = 'https://arbitrum-api.gmxinfra.io/prices/tickers'
const GMX_TOKENS_URL = 'https://arbitrum-api.gmxinfra.io/tokens'

export interface GmxTokenInfo {
  symbol: string
  address: string
  decimals: number
  synthetic?: boolean
}

export interface GmxPriceTicker {
  tokenSymbol: string
  tokenAddress: string
  minPrice: string
  maxPrice: string
  updatedAt: number
  timestamp: number
}

export interface GmxMarketInfoData {
  name: string
  marketToken: string
  indexToken: string
  longToken: string
  shortToken: string
  isListed?: boolean
  openInterestLong: string
  openInterestShort: string
  availableLiquidityLong: string
  availableLiquidityShort: string
  fundingRateLong: string
  fundingRateShort: string
  borrowingRateLong: string
  borrowingRateShort: string
  netRateLong: string
  netRateShort: string
}

interface GmxMarketInfoResponse {
  markets: GmxMarketInfoData[]
}

interface GmxTokensResponse {
  tokens: GmxTokenInfo[]
}

async function fetchMarketInfo(): Promise<GmxMarketInfoResponse> {
  const response = await fetch(GMX_MARKET_INFO_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GMX market info request failed: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as GmxMarketInfoResponse
}

async function fetchPrices(): Promise<GmxPriceTicker[]> {
  const response = await fetch(GMX_PRICES_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GMX prices request failed: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as GmxPriceTicker[]
}

async function fetchTokens(): Promise<GmxTokenInfo[]> {
  const response = await fetch(GMX_TOKENS_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GMX tokens request failed: ${response.status} ${response.statusText}`)
  }
  return ((await response.json()) as GmxTokensResponse).tokens
}

/**
 * Converts an annualized rate returned by the GMX /markets/info endpoint (scaled by 1e30)
 * into a human-readable percentage string with two decimals.
 */
export function formatGmxAnnualizedRate(raw: string | undefined): string {
  if (!raw) {
    return '—'
  }
  try {
    const rate = BigInt(raw)
    const basisPoints = (rate * 10000n) / 10n ** 30n
    const percent = Number(basisPoints) / 100
    return `${percent.toFixed(2)}%`
  } catch {
    return '—'
  }
}

/**
 * Fetches near-live market info, oracle prices, and token metadata from the GMX Oracle API.
 * Used by the open-position modal to display current prices, funding/borrowing rates, and
 * to resolve token decimals for the selected market.
 */
export function useGmxOpenPositionMarketData({ enabled }: { enabled: boolean }): {
  marketInfoByAddress: Map<string, GmxMarketInfoData>
  pricesByTokenAddress: Map<string, GmxPriceTicker>
  tokensByAddress: Map<string, GmxTokenInfo>
  isLoading: boolean
  isError: boolean
} {
  const { data: marketInfo, isLoading: isLoadingMarketInfo, isError: isErrorMarketInfo } = useQuery({
    queryKey: ['gmxMarketInfo'],
    queryFn: fetchMarketInfo,
    enabled,
    staleTime: PollingInterval.Fast,
    gcTime: PollingInterval.Fast,
    retry: 2,
  })

  const { data: prices, isLoading: isLoadingPrices, isError: isErrorPrices } = useQuery({
    queryKey: ['gmxPrices'],
    queryFn: fetchPrices,
    enabled,
    staleTime: PollingInterval.Fast,
    gcTime: PollingInterval.Fast,
    retry: 2,
  })

  const { data: tokens, isLoading: isLoadingTokens, isError: isErrorTokens } = useQuery({
    queryKey: ['gmxTokens'],
    queryFn: fetchTokens,
    enabled,
    staleTime: PollingInterval.Slow,
    gcTime: PollingInterval.Slow,
    retry: 2,
  })

  const marketInfoByAddress = useMemo(() => {
    const map = new Map<string, GmxMarketInfoData>()
    for (const market of marketInfo?.markets ?? []) {
      map.set(normalizeTokenAddressForCache(market.marketToken), market)
    }
    return map
  }, [marketInfo])

  const pricesByTokenAddress = useMemo(() => {
    const map = new Map<string, GmxPriceTicker>()
    for (const price of prices ?? []) {
      map.set(normalizeTokenAddressForCache(price.tokenAddress), price)
    }
    return map
  }, [prices])

  const tokensByAddress = useMemo(() => {
    const map = new Map<string, GmxTokenInfo>()
    for (const token of tokens ?? []) {
      map.set(normalizeTokenAddressForCache(token.address), token)
    }
    return map
  }, [tokens])

  return {
    marketInfoByAddress,
    pricesByTokenAddress,
    tokensByAddress,
    isLoading: isLoadingMarketInfo || isLoadingPrices || isLoadingTokens,
    isError: isErrorMarketInfo || isErrorPrices || isErrorTokens,
  }
}

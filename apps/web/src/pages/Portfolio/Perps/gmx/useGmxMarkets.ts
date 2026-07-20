import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { PollingInterval } from 'uniswap/src/constants/misc'

const GMX_MARKETS_API_URL = 'https://arbitrum-api.gmxinfra.io/markets'

export interface GmxMarketInfo {
  name: string
  marketToken: string
  indexToken: string
  longToken: string
  shortToken: string
  isListed?: boolean
}

/**
 * Fetches the GMX v2 markets list (Arbitrum) to resolve market metadata
 * (index/long/short token addresses) for open positions. Markets change rarely,
 * so a long stale time is fine.
 */
export function useGmxMarkets(): { marketsByAddress: Map<string, GmxMarketInfo>; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['gmxMarkets'],
    queryFn: async (): Promise<GmxMarketInfo[]> => {
      const response = await fetch(GMX_MARKETS_API_URL, { headers: { Accept: 'application/json' } })
      if (!response.ok) {
        throw new Error(`GMX markets request failed: ${response.status} ${response.statusText}`)
      }
      const body = (await response.json()) as { markets: GmxMarketInfo[] } | GmxMarketInfo[]
      const markets = Array.isArray(body) ? body : body.markets
      return markets.filter((market) => market.isListed !== false)
    },
    staleTime: PollingInterval.Slow,
    gcTime: PollingInterval.Slow,
    retry: 2,
  })

  const marketsByAddress = useMemo(() => {
    const map = new Map<string, GmxMarketInfo>()
    for (const market of data ?? []) {
      map.set(market.marketToken.toLowerCase(), market)
    }
    return map
  }, [data])

  return { marketsByAddress, isLoading }
}

import type { RankedMultichainToken } from '@uniswap/client-data-api/dist/data/v2/types_pb'
import type { UniverseChainId } from '@universe/chains'
import type { ChartPoint } from 'uniswap/src/components/charts/computeChartPaths'
import { pickPrimaryDeployment } from 'uniswap/src/data/apiClients/dataApiService/utils/dataApiMultichainToken'
import { multichainTokenKey } from 'uniswap/src/data/apiClients/dataApiService/utils/multichainTokenKey'
import { isUniverseChainId } from 'uniswap/src/features/chains/utils'

/** A ListTokens row flattened for TokenCard surfaces (trending carousel, related tokens). Deployment picked by 1d volume. */
export interface RankedTokenCardItem {
  key: string
  chainId: UniverseChainId
  address: string
  name?: string
  symbol?: string
  logoUrl?: string
  priceUsd?: number
  pricePercentChange1d?: number
  sparkline: ChartPoint[]
}

export function rankedTokenToCardItem(token: RankedMultichainToken): RankedTokenCardItem | undefined {
  const mc = token.multichainToken
  const supportedAddresses = Object.fromEntries(
    Object.entries(mc?.addresses ?? {}).filter(([chainId]) => isUniverseChainId(Number(chainId))),
  )
  const primary = mc
    ? pickPrimaryDeployment({ addresses: supportedAddresses, chainId: undefined, chainStats: token.chainStats })
    : undefined
  if (!mc || !primary || !isUniverseChainId(primary.chainId)) {
    return undefined
  }
  return {
    key: multichainTokenKey(token),
    chainId: primary.chainId,
    address: primary.address,
    name: mc.name,
    symbol: mc.symbol,
    logoUrl: mc.project?.logoUrl,
    priceUsd: mc.price?.spotUsd,
    pricePercentChange1d: mc.price?.percentChange1d,
    sparkline: token.sparkline.map((point) => ({ timestamp: Number(point.timestamp), value: point.value })),
  }
}

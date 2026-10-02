import type { Currency } from '@uniswap/sdk-core'
import type { LinearTickScale } from '~/features/Liquidity/charts/D3LiquidityChartShared/types'
import { priceToTick } from '~/features/Liquidity/charts/D3LiquidityRangeInput/D3LiquidityRangeChart/utils/priceToTick'
import { ChartEntry } from '~/features/Liquidity/charts/LiquidityRangeInput/types'

export type TickAlignment = 'center' | 'top' | 'bottom'

/**
 * Convert a price to Y position.
 *
 * Finds the closest tick in liquidityData for the given price, then converts that tick to Y using
 * the linear scale. A pool that is still being created has no liquidity data to look a tick up in,
 * so its prices are placed analytically instead (the price line is borrowed from a sibling pool and
 * the tick scale is the new pool's).
 */
export function priceToY({
  price,
  liquidityData,
  tickScale,
  baseCurrency,
  quoteCurrency,
  tickAlignment: _tickAlignment,
}: {
  price: number
  liquidityData: ChartEntry[]
  tickScale: LinearTickScale
  /** Visual base/quote (already swapped when priceInverted); only read when there is no liquidity data. */
  baseCurrency?: Maybe<Currency>
  quoteCurrency?: Maybe<Currency>
  tickAlignment?: TickAlignment
}): number {
  if (liquidityData.length === 0) {
    return tickScale.tickToAxis(priceToTick({ price, baseCurrency, quoteCurrency }))
  }

  // Find the entry with the closest price
  const closest = liquidityData.reduce((prev, curr) =>
    Math.abs(curr.price0 - price) < Math.abs(prev.price0 - price) ? curr : prev,
  )

  return tickScale.tickToAxis(closest.tick)
}

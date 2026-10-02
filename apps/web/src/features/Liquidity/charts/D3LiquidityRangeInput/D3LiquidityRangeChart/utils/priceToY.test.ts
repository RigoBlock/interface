import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { LinearTickScale } from '~/features/Liquidity/charts/D3LiquidityChartShared/types'
import { priceToY } from '~/features/Liquidity/charts/D3LiquidityRangeInput/D3LiquidityRangeChart/utils/priceToY'
import { ChartEntry } from '~/features/Liquidity/charts/LiquidityRangeInput/types'
import { getDisplayPriceFromTick } from '~/features/Liquidity/utils/getTickToPrice'
import { TEST_TOKEN_1, TEST_TOKEN_2 } from '~/test-utils/constants'

// Identity scale so a Y position reads directly as a tick.
const tickScale: LinearTickScale = {
  tickToAxis: (tick) => tick,
  axisToTick: (y) => y,
  minTick: -887_220,
  maxTick: 887_220,
  range: [-887_220, 887_220],
}

function entry(tick: number): ChartEntry {
  const price0 = getDisplayPriceFromTick({
    tick,
    baseCurrency: TEST_TOKEN_1,
    quoteCurrency: TEST_TOKEN_2,
    priceInverted: false,
    protocolVersion: ProtocolVersion.V4,
  })
  return { tick, price0: price0 ?? 0, liquidityActive: 1 }
}

describe('priceToY', () => {
  it('snaps to the closest liquidity entry when there is a distribution', () => {
    const liquidityData = [entry(-120), entry(0), entry(120)]
    // Tick 50 sits closer to 0 than to 120, so the price line lands on the tick-0 entry.
    const price = getDisplayPriceFromTick({
      tick: 50,
      baseCurrency: TEST_TOKEN_1,
      quoteCurrency: TEST_TOKEN_2,
      priceInverted: false,
      protocolVersion: ProtocolVersion.V4,
    })
    expect(priceToY({ price: price ?? 0, liquidityData, tickScale })).toBe(0)
  })

  it('places the price on its own tick when there is no liquidity data', () => {
    const price = getDisplayPriceFromTick({
      tick: 1_234,
      baseCurrency: TEST_TOKEN_1,
      quoteCurrency: TEST_TOKEN_2,
      priceInverted: false,
      protocolVersion: ProtocolVersion.V4,
    })
    expect(
      priceToY({
        price: price ?? 0,
        liquidityData: [],
        tickScale,
        baseCurrency: TEST_TOKEN_1,
        quoteCurrency: TEST_TOKEN_2,
      }),
    ).toBeCloseTo(1_234, 2)
  })
})

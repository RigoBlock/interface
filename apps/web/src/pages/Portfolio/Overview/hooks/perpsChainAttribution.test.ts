import { UniverseChainId } from '@universe/chains'
import { getPerpsExtrasForChain } from '~/pages/Portfolio/Overview/hooks/perpsChainAttribution'

const EXTRAS = {
  gmxTotalNetValueUsd: 1_000,
  hyperliquidPerpsValueUsd: 58_000,
  hyperliquidSpotValueUsd: 500,
  hyperEvmUsdcValueUsd: 250,
}

describe('getPerpsExtrasForChain', () => {
  it('counts every extra on All Networks (chainId undefined), unchanged', () => {
    expect(getPerpsExtrasForChain({ chainId: undefined, extras: EXTRAS })).toEqual({
      ...EXTRAS,
      gmxHistoryForChain: true,
      hyperliquidHistoryForChain: true,
    })
  })

  it('zeroes all perps extras for an unrelated chain (BNB)', () => {
    expect(getPerpsExtrasForChain({ chainId: UniverseChainId.Bnb, extras: EXTRAS })).toEqual({
      gmxTotalNetValueUsd: 0,
      hyperliquidPerpsValueUsd: 0,
      hyperliquidSpotValueUsd: 0,
      hyperEvmUsdcValueUsd: 0,
      gmxHistoryForChain: false,
      hyperliquidHistoryForChain: false,
    })
  })

  it('attributes GMX perps to Arbitrum only', () => {
    const result = getPerpsExtrasForChain({ chainId: UniverseChainId.ArbitrumOne, extras: EXTRAS })
    expect(result.gmxTotalNetValueUsd).toEqual(EXTRAS.gmxTotalNetValueUsd)
    expect(result.gmxHistoryForChain).toEqual(true)
    expect(result.hyperliquidPerpsValueUsd).toEqual(0)
    expect(result.hyperliquidSpotValueUsd).toEqual(0)
    expect(result.hyperEvmUsdcValueUsd).toEqual(0)
  })

  it('attributes the HyperEVM USDC balance to HyperEVM (999) only', () => {
    const result = getPerpsExtrasForChain({ chainId: UniverseChainId.HyperEvm, extras: EXTRAS })
    expect(result.hyperEvmUsdcValueUsd).toEqual(EXTRAS.hyperEvmUsdcValueUsd)
    expect(result.gmxTotalNetValueUsd).toEqual(0)
    expect(result.hyperliquidPerpsValueUsd).toEqual(0)
  })
})

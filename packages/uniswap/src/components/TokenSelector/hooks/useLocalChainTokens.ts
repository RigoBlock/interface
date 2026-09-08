import { useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getPrimaryStablecoin, isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { buildCurrencyInfo } from 'uniswap/src/features/dataApi/utils/buildCurrency'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

/**
 * Tokens that are selectable on chains without backend (indexer) support — e.g. HyperEVM.
 * The Uniswap backends do not index these chains, so token lists, trending tokens and
 * search all fail there. Rigoblock smart pools only use the chain's primary stablecoin
 * (always USDC) on such chains, so we expose it from local chain config instead.
 */
export function useLocalChainTokens(chainFilter: Maybe<UniverseChainId>): CurrencyInfo[] {
  return useMemo(() => {
    if (!chainFilter || isBackendSupportedChainId(chainFilter)) {
      return []
    }
    const stablecoin = getPrimaryStablecoin(chainFilter)
    if (!stablecoin) {
      return []
    }
    return [
      buildCurrencyInfo({
        currency: stablecoin,
        currencyId: buildCurrencyId(chainFilter, stablecoin.address),
        logoUrl: undefined,
        safetyInfo: undefined,
      }),
    ]
  }, [chainFilter])
}

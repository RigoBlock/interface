import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { normalizeCurrencyIdForMapLookup } from 'uniswap/src/data/cache'
import {
  makeSelectHasTokenFavorited,
  makeSelectHasTokenFavoritedByAddress,
} from 'uniswap/src/features/favorites/selectors'
import { UniswapState } from 'uniswap/src/state/uniswapReducer'

export function useSelectHasTokenFavorited(currencyId: string): boolean {
  const isMultichainEnabled = useFeatureFlag(FeatureFlags.MultichainTokenUx)
  const selectExact = useMemo(makeSelectHasTokenFavorited, [])
  const selectByAddress = useMemo(makeSelectHasTokenFavoritedByAddress, [])

  return useSelector((state: UniswapState) => {
    if (isMultichainEnabled) {
      return selectByAddress(state, currencyId)
    } else {
      return selectExact(state, normalizeCurrencyIdForMapLookup(currencyId))
    }
  })
}

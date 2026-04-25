import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { normalizeCurrencyIdForMapLookup, normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { selectFavoriteTokens } from 'uniswap/src/features/favorites/selectors'
import { addFavoriteToken, removeFavoriteToken } from 'uniswap/src/features/favorites/slice'
import { MobileEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { CurrencyId } from 'uniswap/src/types/currency'
import { currencyIdToAddress, currencyIdToChain } from 'uniswap/src/utils/currencyId'

/**
 * Find the stored favorite CurrencyId that matches the given id by address (ignoring chain).
 * Returns undefined if no match found.
 */
function findFavoriteByAddress(favorites: string[], currencyId: string): string | undefined {
  const address = currencyIdToAddress(currencyId)
  if (!address) {
    return undefined
  }
  const normalized = normalizeTokenAddressForCache(address)
  return (
    favorites.find((fav) => normalizeCurrencyIdForMapLookup(fav) === normalizeCurrencyIdForMapLookup(currencyId)) ??
    favorites.find((fav) => {
      const favAddress = currencyIdToAddress(fav)
      return favAddress ? normalizeTokenAddressForCache(favAddress) === normalized : false
    })
  )
}

export function useToggleFavoriteCallback({
  id,
  tokenName,
  isFavoriteToken,
}: {
  id: CurrencyId
  tokenName?: string
  isFavoriteToken: boolean
}): () => void {
  const dispatch = useDispatch()
  const isMultichainEnabled = useFeatureFlag(FeatureFlags.MultichainTokenUx)
  const favorites = useSelector(selectFavoriteTokens)

  return useCallback(() => {
    if (isFavoriteToken) {
      if (isMultichainEnabled) {
        // Find by address match since stored CurrencyId may be on a different chain
        const storedId = findFavoriteByAddress(favorites, id)
        dispatch(removeFavoriteToken({ currencyId: storedId ?? normalizeCurrencyIdForMapLookup(id) }))
      } else {
        dispatch(removeFavoriteToken({ currencyId: normalizeCurrencyIdForMapLookup(id) }))
      }
    } else {
      const normalizedId = normalizeCurrencyIdForMapLookup(id)
      sendAnalyticsEvent(MobileEventName.FavoriteItem, {
        address: currencyIdToAddress(normalizedId),
        chain: currencyIdToChain(id) as number,
        type: 'token',
        name: tokenName,
      })
      dispatch(addFavoriteToken({ currencyId: normalizedId }))
    }
  }, [dispatch, id, isFavoriteToken, tokenName, isMultichainEnabled, favorites])
}

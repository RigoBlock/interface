import { TokenRankingsResponse } from '@uniswap/client-explore/dist/uniswap/explore/v1/service_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScrollView } from 'react-native'
import { FlatList } from 'react-native-gesture-handler'
import type { AnimatedRef } from 'react-native-reanimated'
import { FadeIn } from 'react-native-reanimated'
import type { SortableGridDragEndCallback, SortableGridRenderItem } from 'react-native-sortables'
import Sortable from 'react-native-sortables'
import { useDispatch, useSelector } from 'react-redux'
import { FavoriteHeaderRow } from 'src/components/explore/FavoriteHeaderRow'
import FavoriteTokenCard from 'src/components/explore/FavoriteTokenCard'
import { getTokenValue } from 'ui/src'
import { AnimatedFlex } from 'ui/src/components/layout/AnimatedFlex'
import { Flex } from 'ui/src/components/layout/Flex'
import { ExpandoRow } from 'uniswap/src/components/ExpandoRow/ExpandoRow'
import { getNativeAddress } from 'uniswap/src/constants/addresses'
import { normalizeCurrencyIdForMapLookup, normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { selectFavoriteTokens } from 'uniswap/src/features/favorites/selectors'
import { setFavoriteTokens } from 'uniswap/src/features/favorites/slice'
import { useCanonicalFavoritesMigration } from 'uniswap/src/features/favorites/useCanonicalFavoritesMigration'
import { useHapticFeedback } from 'uniswap/src/features/settings/useHapticFeedback/useHapticFeedback'

const NUM_COLUMNS = 2
const DEFAULT_TOKENS_TO_DISPLAY = 4

type FavoriteTokensGridProps = {
  showLoading: boolean
  listRef: AnimatedRef<FlatList> | AnimatedRef<ScrollView>
  tokenRankingsData: TokenRankingsResponse | undefined
}

/** Renders the favorite tokens section on the Explore tab */
export function FavoriteTokensGrid({
  showLoading,
  listRef,
  tokenRankingsData,
  ...rest
}: FavoriteTokensGridProps): JSX.Element | null {
  const { t } = useTranslation()
  const { hapticFeedback } = useHapticFeedback()
  const dispatch = useDispatch()
  const multichainTokenUxEnabled = useFeatureFlag(FeatureFlags.MultichainTokenUx)

  // One-time dedupe + canonicalization of favorites when multichain flag is enabled
  useCanonicalFavoritesMigration({ multichainTokenUxEnabled, tokenRankingsData })

  // Build {chainId}-{address} → networkCount map from TokenRankings chainTokens for network badge logic
  // Key includes chainId to avoid collisions between native tokens on different chains (all share 0xeeee...)
  const networkCountByCurrencyId = useMemo(() => {
    const map = new Map<string, number>()
    if (!tokenRankingsData) {
      return map
    }
    for (const category of Object.values(tokenRankingsData.tokenRankings)) {
      for (const token of category.tokens) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- chainTokens can be undefined at runtime despite protobuf typing
        if (!token.chainTokens) {
          continue
        }
        for (const ct of token.chainTokens) {
          // Native tokens have empty address in the API — use the EVM native placeholder
          const addr = ct.address || getNativeAddress(ct.chainId)
          if (addr) {
            map.set(`${ct.chainId}-${normalizeTokenAddressForCache(addr)}`, token.chainTokens.length)
          }
        }
      }
    }
    return map
  }, [tokenRankingsData])

  const [isEditing, setIsEditing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const favoriteCurrencyIds = useSelector(selectFavoriteTokens)

  // Reset edit mode when there are no favorite tokens
  useEffect(() => {
    if (favoriteCurrencyIds.length === 0) {
      setIsEditing(false)
    }
  }, [favoriteCurrencyIds.length])

  // Automatically expand when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setShowAll(true)
    }
  }, [isEditing])

  const handleDragStart = useCallback(async () => {
    await hapticFeedback.light()
  }, [hapticFeedback])

  const hasMoreTokens = favoriteCurrencyIds.length > DEFAULT_TOKENS_TO_DISPLAY
  const visibleTokens =
    showAll || !hasMoreTokens ? favoriteCurrencyIds : favoriteCurrencyIds.slice(0, DEFAULT_TOKENS_TO_DISPLAY)

  const GRID_GAP = getTokenValue('$spacing8')

  const handleDragEnd = useCallback<SortableGridDragEndCallback<string>>(
    async ({ data }) => {
      await hapticFeedback.light()
      if (showAll || !hasMoreTokens) {
        dispatch(setFavoriteTokens({ currencyIds: data }))
      } else {
        // merge reordered visible tokens with hidden ones
        const hiddenTokens = favoriteCurrencyIds.slice(DEFAULT_TOKENS_TO_DISPLAY)
        dispatch(setFavoriteTokens({ currencyIds: [...data, ...hiddenTokens] }))
      }
    },
    [hapticFeedback, dispatch, showAll, favoriteCurrencyIds, hasMoreTokens],
  )

  const renderItem = useCallback<SortableGridRenderItem<string>>(
    ({ item: currencyId }): JSX.Element => {
      const networkCount = networkCountByCurrencyId.get(normalizeCurrencyIdForMapLookup(currencyId))
      return (
        <FavoriteTokenCard
          showLoading={showLoading}
          currencyId={currencyId}
          isEditing={isEditing}
          networkCount={networkCount}
          setIsEditing={setIsEditing}
        />
      )
    },
    [isEditing, showLoading, networkCountByCurrencyId],
  )

  return (
    <Sortable.Layer>
      <AnimatedFlex entering={FadeIn}>
        <FavoriteHeaderRow
          disabled={showLoading}
          editingTitle={t('explore.tokens.favorite.title.edit')}
          isEditing={isEditing}
          title={t('explore.tokens.favorite.title.default')}
          onPress={(): void => setIsEditing(!isEditing)}
        />

        <Flex>
          <Sortable.Grid
            {...rest}
            scrollableRef={listRef}
            data={visibleTokens}
            sortEnabled={isEditing}
            autoScrollActivationOffset={[75, 100]}
            columns={NUM_COLUMNS}
            renderItem={renderItem}
            rowGap={GRID_GAP}
            columnGap={GRID_GAP}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
          />
          {hasMoreTokens && (
            <ExpandoRow
              isExpanded={showAll}
              label={showAll ? t('common.showLess.button') : t('common.showMore.button')}
              mx="$spacing16"
              onPress={(): void => setShowAll((value: boolean) => !value)}
            />
          )}
        </Flex>
      </AnimatedFlex>
    </Sortable.Layer>
  )
}

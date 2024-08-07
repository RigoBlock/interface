import { default as React } from 'react'
import { useAppDispatch } from 'src/app/hooks'
import { useAppStackNavigation } from 'src/app/navigation/types'
import { Flex, ImpactFeedbackStyle, Text, TouchableArea } from 'ui/src'
import { Verified } from 'ui/src/components/icons'
import { iconSizes } from 'ui/src/theme'
import { MobileEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { MobileScreens } from 'uniswap/src/types/screens/mobile'
import { NFTViewer } from 'wallet/src/features/images/NFTViewer'
import { SearchContext } from 'wallet/src/features/search/SearchContext'
import { NFTCollectionSearchResult, SearchResultType } from 'wallet/src/features/search/SearchResult'
import { addToSearchHistory } from 'wallet/src/features/search/searchHistorySlice'

type NFTCollectionItemProps = {
  collection: NFTCollectionSearchResult
  searchContext?: SearchContext
}

export function SearchNFTCollectionItem({ collection, searchContext }: NFTCollectionItemProps): JSX.Element {
  const { name, address, chainId, isVerified, imageUrl } = collection
  const dispatch = useAppDispatch()
  const navigation = useAppStackNavigation()

  const onPress = (): void => {
    navigation.navigate(MobileScreens.NFTCollection, {
      collectionAddress: address,
    })

    if (searchContext) {
      sendAnalyticsEvent(MobileEventName.ExploreSearchResultClicked, {
        query: searchContext.query,
        name,
        chain: chainId,
        address,
        type: 'collection',
        suggestion_count: searchContext.suggestionCount,
        position: searchContext.position,
        isHistory: searchContext.isHistory,
      })
    }

    dispatch(
      addToSearchHistory({
        searchResult: {
          type: SearchResultType.NFTCollection,
          chainId,
          address,
          name,
          imageUrl,
          isVerified,
        },
      }),
    )
  }

  return (
    <TouchableArea
      hapticFeedback
      hapticStyle={ImpactFeedbackStyle.Light}
      testID={TestID.SearchNFTCollectionItem}
      onPress={onPress}
    >
      <Flex row alignItems="center" gap="$spacing8" justifyContent="flex-start" px="$spacing8" py="$spacing12">
        <Flex
          centered
          borderRadius="$roundedFull"
          height={iconSizes.icon40}
          mr="$spacing4"
          overflow="hidden"
          width={iconSizes.icon40}
        >
          {imageUrl ? (
            <NFTViewer uri={imageUrl} />
          ) : (
            <Text color="$neutral1" numberOfLines={1} textAlign="center">
              {name.slice(0, 1)}
            </Text>
          )}
        </Flex>
        <Flex shrink>
          <Text color="$neutral1" numberOfLines={1} variant="body1">
            {name}
          </Text>
        </Flex>
        <Flex grow alignItems="flex-start" width="$spacing36">
          {isVerified ? <Verified color="$accent1" size="$icon.16" /> : null}
        </Flex>
      </Flex>
    </TouchableArea>
  )
}

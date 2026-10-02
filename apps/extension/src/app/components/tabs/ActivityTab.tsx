import { Flex, Loader, ScrollView } from '@universe/mycelium'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataApiOutageBanner } from 'uniswap/src/features/dataApi/outage/DataApiOutageBanner'
import { DataApiOutageModalContent } from 'uniswap/src/features/dataApi/outage/DataApiOutageModalContent'
import { useEvent } from 'utilities/src/react/hooks'
import { useInfiniteScroll } from 'utilities/src/react/useInfiniteScroll'
import { useActivityDataWallet } from 'wallet/src/features/activity/useActivityDataWallet'

export const ActivityTab = memo(function ActivityTabInner({
  address,
  skip,
  canShowOutageBanner = false,
}: {
  address: Address
  skip?: boolean
  canShowOutageBanner?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [isOutageModalOpen, setIsOutageModalOpen] = useState(false)
  const {
    maybeEmptyComponent,
    renderActivityItem,
    sectionData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    error,
    dataUpdatedAt,
  } = useActivityDataWallet({
    evmOwner: address,
    skip,
  })

  const shouldShowOutageBanner = canShowOutageBanner && Boolean(error) && !isFetchNextPageError
  const handleOutageBannerPress = useEvent(() => setIsOutageModalOpen(true))
  const handleOutageModalClose = useEvent(() => setIsOutageModalOpen(false))

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: fetchNextPage,
    hasNextPage,
    isFetching: isFetchingNextPage,
  })

  return (
    <>
      {maybeEmptyComponent ?? (
        <ScrollView showsVerticalScrollIndicator={false} width="100%">
          {shouldShowOutageBanner && (
            <Flex px="$spacing8">
              <DataApiOutageBanner
                title={t('dataApi.outage.banner.activity.title')}
                onPress={handleOutageBannerPress}
              />
            </Flex>
          )}
          {/* `sectionData` will be either an array of transactions or an array of loading skeletons */}
          {sectionData.map((item, index) => renderActivityItem({ item, index }))}
          {/* Show skeleton loading indicator while fetching next page */}
          {isFetchingNextPage && (
            <Flex px="$spacing8">
              <Loader.Transaction />
            </Flex>
          )}
          {/* Intersection observer sentinel for infinite scroll */}
          <Flex ref={sentinelRef} height={1} my={10} />
        </ScrollView>
      )}
      {/* Keep the modal mounted through activity recovery, including recovery to an empty state. */}
      <DataApiOutageModalContent
        isOpen={isOutageModalOpen}
        lastUpdatedAt={dataUpdatedAt}
        onClose={handleOutageModalClose}
      />
    </>
  )
})

import { Flex, Text } from '@universe/mycelium'
import { RelativeChange } from 'uniswap/src/components/RelativeChange/RelativeChange'
import { getTokenCategoryIcon } from 'uniswap/src/features/tokenCategories/categoryIcons'
import { getRwaCategoryForTokenCategory } from 'uniswap/src/features/tokenCategories/rwaCategoryBridge'
import { hasRwaDisclaimer, RwaDisclaimerText } from 'uniswap/src/features/tokenCategories/RwaDisclaimerText'
import type { TokenCategory } from 'uniswap/src/features/tokenCategories/types'
import { LoadingBubble } from '~/components/Tokens/loading'
import { renderWebDisclaimerLink } from '~/pages/Explore/categories/ExploreRwaDisclaimer'

const ICON_TILE_SIZE = 64
const DESCRIPTION_MAX_WIDTH = 680

export function CategoryDetailsHeader({ category }: { category: TokenCategory }): JSX.Element {
  const Icon = getTokenCategoryIcon(category)
  const rwaCategory = getRwaCategoryForTokenCategory(category)

  return (
    <Flex row gap="$spacing16" alignItems="flex-start" width="100%">
      <Flex
        centered
        flexShrink={0}
        borderRadius="$rounded12"
        backgroundColor="$accent2"
        width={ICON_TILE_SIZE}
        height={ICON_TILE_SIZE}
      >
        <Icon color="$accent1" size="$icon.36" />
      </Flex>
      <Flex gap="$spacing4" flexShrink={1}>
        <Flex row gap="$spacing8" alignItems="center">
          <Text tag="h1" variant="heading3" color="$neutral1" m={0}>
            {category.name}
          </Text>
          <RelativeChange
            change={category.stats?.priceChange24hPct}
            variant="body2"
            arrowSize="$icon.16"
            semanticColor
          />
        </Flex>
        <Text variant="body2" color="$neutral2" maxWidth={DESCRIPTION_MAX_WIDTH}>
          {category.description}
          {hasRwaDisclaimer(rwaCategory) && (
            <>
              {' '}
              <RwaDisclaimerText category={rwaCategory} renderLink={renderWebDisclaimerLink} />
            </>
          )}
        </Text>
      </Flex>
    </Flex>
  )
}

export function CategoryDetailsHeaderSkeleton(): JSX.Element {
  return (
    <Flex row gap="$spacing16" alignItems="flex-start" width="100%">
      <LoadingBubble width={ICON_TILE_SIZE} height={ICON_TILE_SIZE} />
      <Flex gap="$spacing8" flexShrink={1} pt="$spacing4">
        <LoadingBubble width={220} height="$spacing24" />
        <LoadingBubble width={360} height="$spacing16" />
      </Flex>
    </Flex>
  )
}

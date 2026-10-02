import { RwaCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { CategoryTag } from 'uniswap/src/features/expandableAsset/CategoryTag'
import { RWA_CATEGORY_IDS } from 'uniswap/src/features/tokenCategories/rwaCategoryBridge'
import { selectTokenRowCategoryTag } from 'uniswap/src/features/tokenCategories/selectTokenRowCategoryTag'
import { TokenCategoryTag } from 'uniswap/src/features/tokenCategories/TokenCategoryTag'
import type { TokenCategory } from 'uniswap/src/features/tokenCategories/types'

/** RWA rows keep the ListRwas-derived tag so it renders while `token_categories` is off; every other row
 *  resolves its first BE-ranked id against `categories` (the cached ListCategories list). Both skip
 *  `scopedCategoryId` (the section's own category). */
export function getRowCategoryTag({
  rwaCategory,
  categoryIds,
  categories,
  scopedCategoryId,
}: {
  rwaCategory?: RwaCategory
  categoryIds?: string[]
  categories: TokenCategory[]
  scopedCategoryId?: string
}): JSX.Element | undefined {
  if (
    rwaCategory != null &&
    rwaCategory !== RwaCategory.UNSPECIFIED &&
    (scopedCategoryId === undefined || RWA_CATEGORY_IDS[rwaCategory] !== scopedCategoryId)
  ) {
    return <CategoryTag category={rwaCategory} />
  }
  const category = selectTokenRowCategoryTag({ categoryIds, categories, scopedCategoryId })
  return category ? <TokenCategoryTag category={category} /> : undefined
}

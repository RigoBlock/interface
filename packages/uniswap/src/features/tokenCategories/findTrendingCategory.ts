import { TokenCategory, TokenCategoryClass } from 'uniswap/src/features/tokenCategories/types'
import { normalizeTextInput } from 'utilities/src/primitives/string'

const TRENDING_CATEGORY_NAME = 'trending'

export function findTrendingCategory(categories: TokenCategory[] | undefined): TokenCategory | undefined {
  return categories?.find(
    (category) =>
      category.categoryClass === TokenCategoryClass.Market &&
      normalizeTextInput(category.name) === TRENDING_CATEGORY_NAME,
  )
}

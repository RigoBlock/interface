import { TokenCategory } from 'uniswap/src/features/tokenCategories/types'

/**
 * Picks the row tag from `categoryIds` (BE order is the BE's ranking, so the first one wins), skipping
 * the in-scope category — inside its own view it is noise — and any id `categories` can't resolve.
 */
export function selectTokenRowCategoryTag({
  categoryIds,
  categories,
  scopedCategoryId,
}: {
  categoryIds: string[] | undefined
  categories: TokenCategory[]
  scopedCategoryId?: string
}): TokenCategory | undefined {
  for (const id of categoryIds ?? []) {
    if (id === scopedCategoryId) {
      continue
    }
    const category = categories.find((candidate) => candidate.id === id)
    if (category) {
      return category
    }
  }
  return undefined
}

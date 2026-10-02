import type { RwaCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'
import { useAllTokenCategories } from 'uniswap/src/data/apiClients/dataApiService/categories/useAllTokenCategories'
import { getRowCategoryTag } from 'uniswap/src/features/tokenCategories/getRowCategoryTag'

/** Row-level wrapper over `getRowCategoryTag`: subscribes the row to ListCategories so it re-renders when the
 *  data lands, and memoizes the element so memoized row components keep a stable prop. */
export function useRowCategoryTag({
  rwaCategory,
  categoryIds,
}: {
  rwaCategory?: RwaCategory
  categoryIds?: string[]
}): JSX.Element | undefined {
  const { categories } = useAllTokenCategories()
  return useMemo(
    () => getRowCategoryTag({ rwaCategory, categoryIds, categories }),
    [rwaCategory, categoryIds, categories],
  )
}

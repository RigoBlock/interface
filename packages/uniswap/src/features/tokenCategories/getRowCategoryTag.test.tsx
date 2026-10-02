import { RwaCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { getRowCategoryTag } from 'uniswap/src/features/tokenCategories/getRowCategoryTag'
import { tokenCategory } from 'uniswap/src/test/fixtures/tokenCategory'
import { render } from 'uniswap/src/test/test-utils'

const defi = tokenCategory({ id: 'defi', name: 'DeFi' })
const gaming = tokenCategory({ id: 'gaming', name: 'Gaming' })
const categories = [defi, gaming]

function renderTag(input: {
  categoryIds?: string[]
  rwaCategory?: RwaCategory
  scopedCategoryId?: string
}): (text: string) => boolean {
  const tag = getRowCategoryTag({ ...input, categories })
  const { queryByText } = render(<>{tag}</>)
  return (text) => queryByText(text) !== null
}

describe('getRowCategoryTag', () => {
  it('renders the primary (first) category', () => {
    const shows = renderTag({ categoryIds: ['gaming', 'defi'] })
    expect(shows('Gaming')).toBe(true)
    expect(shows('DeFi')).toBe(false)
  })

  it('prefers the RWA tag over the taxonomy primary category', () => {
    const shows = renderTag({ categoryIds: ['defi'], rwaCategory: RwaCategory.STOCKS })
    expect(shows('Stocks')).toBe(true)
    expect(shows('DeFi')).toBe(false)
  })

  it('skips the RWA tag inside its own category section and falls through to the next taxonomy id', () => {
    const shows = renderTag({
      categoryIds: ['stocks', 'defi'],
      rwaCategory: RwaCategory.STOCKS,
      scopedCategoryId: 'stocks',
    })
    expect(shows('Stocks')).toBe(false)
    expect(shows('DeFi')).toBe(true)
  })

  it('falls through to the taxonomy category when the RWA category is unspecified', () => {
    expect(renderTag({ categoryIds: ['defi'], rwaCategory: RwaCategory.UNSPECIFIED })('DeFi')).toBe(true)
  })

  it('returns nothing for a token without any category data', () => {
    expect(getRowCategoryTag({ categories })).toBe(undefined)
  })
})

import { UniswapHelpUrls } from 'uniswap/src/constants/urls'
import { TokenCategoryClass } from 'uniswap/src/features/tokenCategories/types'
import { tokenCategory } from 'uniswap/src/test/fixtures/tokenCategory'
import { getCategoryLearnMoreUrl } from '~/components/CategoryDefinitionCard/getCategoryLearnMoreUrl'

describe('getCategoryLearnMoreUrl', () => {
  it('returns the stocks help article for the stocks category', () => {
    const stocks = tokenCategory({ id: 'stocks', categoryClass: TokenCategoryClass.Asset })
    expect(getCategoryLearnMoreUrl(stocks)).toBe(UniswapHelpUrls.articles.rwaExploreDisclaimer)
  })

  it('returns the ETFs help article for the etfs category', () => {
    const etfs = tokenCategory({ id: 'etfs', categoryClass: TokenCategoryClass.Asset })
    expect(getCategoryLearnMoreUrl(etfs)).toBe(UniswapHelpUrls.articles.rwaExploreDisclaimerEtfs)
  })

  it('returns undefined for categories without a help article', () => {
    expect(getCategoryLearnMoreUrl(tokenCategory({ id: 'commodities' }))).toBeUndefined()
    expect(getCategoryLearnMoreUrl(tokenCategory({ id: 'trending' }))).toBeUndefined()
  })
})

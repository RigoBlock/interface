import { getRwaCategoryForTokenCategory } from 'uniswap/src/features/tokenCategories/rwaCategoryBridge'
import { getRwaDisclaimerHelpUrl } from 'uniswap/src/features/tokenCategories/RwaDisclaimerText'
import type { TokenCategory } from 'uniswap/src/features/tokenCategories/types'

export function getCategoryLearnMoreUrl(category: TokenCategory): string | undefined {
  return getRwaDisclaimerHelpUrl(getRwaCategoryForTokenCategory(category))
}

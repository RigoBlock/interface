import { GraphQLApi } from '@universe/api'
import { RIGOBLOCK_LOGO } from 'ui/src/assets'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { fromGraphQLChain } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { buildCurrency, buildCurrencyInfo } from 'uniswap/src/features/dataApi/utils/buildCurrency'
import { getCurrencySafetyInfo } from 'uniswap/src/features/dataApi/utils/getCurrencySafetyInfo'
import { currencyId } from 'uniswap/src/utils/currencyId'

// Type for the token parameter that gqlTokenToCurrencyInfo expects
export type GqlTokenToCurrencyInfoToken = Omit<NonNullable<NonNullable<GraphQLApi.TokenQuery['token']>>, 'project'> & {
  project?: Omit<NonNullable<NonNullable<GraphQLApi.TokenQuery['token']>['project']>, 'tokens'>
}

export function gqlTokenToCurrencyInfo(token: GqlTokenToCurrencyInfoToken): CurrencyInfo | null {
  const { name, chain, address, decimals, symbol, project, feeData, protectionInfo, isBridged, bridgedWithdrawalInfo } =
    token
  const chainId = fromGraphQLChain(chain)

  const currency = buildCurrency({
    chainId,
    address,
    decimals,
    symbol,
    name,
    buyFeeBps: feeData?.buyFeeBps,
    sellFeeBps: feeData?.sellFeeBps,
  })

  if (!currency) {
    return null
  }

  // Override logoUrl for GRG tokens on Unichain only
  let finalLogoUrl = project?.logoUrl
  if (!currency.isNative && currency.address && currency.chainId === UniverseChainId.Unichain) {
    const isGrgToken = Object.values(GRG).some(
      (grgToken) =>
        grgToken.chainId === currency.chainId && grgToken.address.toLowerCase() === currency.address.toLowerCase(),
    )

    if (isGrgToken) {
      finalLogoUrl = RIGOBLOCK_LOGO
    }
  }

  return buildCurrencyInfo({
    currency,
    currencyId: currencyId(currency),
    logoUrl: finalLogoUrl,
    safetyInfo: getCurrencySafetyInfo(project?.safetyLevel, protectionInfo),
    // defaulting to not spam. currently this flow triggers when a user is searching
    // for a token, in which case the user probably doesn't expect the token to be spam
    isSpam: project?.isSpam ?? false,
    isBridged,
    bridgedWithdrawalInfo,
  })
}

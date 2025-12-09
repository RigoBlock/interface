import { GraphQLApi } from '@universe/api'
import { RIGOBLOCK_LOGO } from 'ui/src/assets'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { fromGraphQLChain } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { buildCurrency, buildCurrencyInfo } from 'uniswap/src/features/dataApi/utils/buildCurrency'
import { getCurrencySafetyInfo } from 'uniswap/src/features/dataApi/utils/getCurrencySafetyInfo'
import { currencyId } from 'uniswap/src/utils/currencyId'

export function tokenProjectToCurrencyInfos(
  tokenProjects: GraphQLApi.TokenProjectsQuery['tokenProjects'],
  chainFilter?: UniverseChainId | null,
): CurrencyInfo[] {
  return tokenProjects
    ?.flatMap((project) =>
      project?.tokens.map((token) => {
        const { logoUrl, safetyLevel } = project
        const { name, chain, address, decimals, symbol, feeData, protectionInfo, isBridged, bridgedWithdrawalInfo } =
          token
        const chainId = fromGraphQLChain(chain)

        if (chainFilter && chainFilter !== chainId) {
          return null
        }

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
        let finalLogoUrl = logoUrl
        if (!currency.isNative && currency.address && currency.chainId === UniverseChainId.Unichain) {
          const isGrgToken = Object.values(GRG).some(
            (grgToken) =>
              grgToken.chainId === currency.chainId &&
              grgToken.address.toLowerCase() === currency.address.toLowerCase(),
          )

          if (isGrgToken) {
            finalLogoUrl = RIGOBLOCK_LOGO
          }
        }

        const currencyInfo = buildCurrencyInfo({
          currency,
          currencyId: currencyId(currency),
          logoUrl: finalLogoUrl,
          safetyInfo: getCurrencySafetyInfo(safetyLevel, protectionInfo),
          isBridged,
          bridgedWithdrawalInfo,
        })

        return currencyInfo
      }),
    )
    .filter(Boolean) as CurrencyInfo[]
}

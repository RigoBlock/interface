import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, TouchableArea } from 'ui/src'
import { OnSelectCurrency, TokenOption, TokenSection } from 'uniswap/src/components/TokenSelector/types'
import { getTokenOptionsSection } from 'uniswap/src/components/TokenSelector/utils'
import { SafetyLevel } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { GqlResult } from 'uniswap/src/data/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { TokenSelectorList } from 'wallet/src/components/TokenSelector/TokenSelectorList'
import { buildCurrency, gqlTokenToCurrencyInfo } from 'wallet/src/features/dataApi/utils'
import { SearchResultType, TokenSearchResult } from 'wallet/src/features/search/SearchResult'
import { clearSearchHistory } from 'wallet/src/features/search/searchHistorySlice'
import { selectSearchHistory } from 'wallet/src/features/search/selectSearchHistory'
import { usePopularTokens } from 'wallet/src/features/tokens/hooks'
import { useAppDispatch, useAppSelector } from 'wallet/src/state'

function searchResultToCurrencyInfo({
  chainId,
  address,
  symbol,
  name,
  logoUrl,
  safetyLevel,
}: TokenSearchResult): CurrencyInfo | null {
  const currency = buildCurrency({
    chainId,
    address,
    decimals: 0, // this does not matter in a context of CurrencyInfo here, as we do not provide any balance
    symbol,
    name,
  })

  if (!currency) {
    return null
  }

  const currencyInfo: CurrencyInfo = {
    currency,
    currencyId: currencyId(currency),
    logoUrl,
    safetyLevel: safetyLevel ?? SafetyLevel.StrongWarning,
    // defaulting to not spam, as user has searched and chosen this token before
    isSpam: false,
  }
  return currencyInfo
}

function currencyInfosToTokenOptions(currencyInfos: Array<CurrencyInfo | null> | undefined): TokenOption[] | undefined {
  return currencyInfos
    ?.filter((cI): cI is CurrencyInfo => Boolean(cI))
    .map((currencyInfo) => ({
      currencyInfo,
      quantity: null,
      balanceUSD: undefined,
    }))
}

function ClearAll({ onPress }: { onPress: () => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <TouchableArea onPress={onPress}>
      <Text color="$accent1" variant="buttonLabel3">
        {t('tokens.selector.button.clear')}
      </Text>
    </TouchableArea>
  )
}

function useTokenSectionsForEmptySearch(): GqlResult<TokenSection[]> {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  const { popularTokens, loading } = usePopularTokens()

  const searchHistory = useAppSelector(selectSearchHistory)

  // it's a depenedency of useMemo => useCallback
  const onPressClearSearchHistory = useCallback((): void => {
    dispatch(clearSearchHistory())
  }, [dispatch])

  const sections = useMemo(
    () => [
      ...(getTokenOptionsSection(
        t('tokens.selector.section.recent'),
        currencyInfosToTokenOptions(
          searchHistory
            .filter((searchResult): searchResult is TokenSearchResult => searchResult.type === SearchResultType.Token)
            .map(searchResultToCurrencyInfo),
        ),
        <ClearAll onPress={onPressClearSearchHistory} />,
      ) ?? []),
      ...(getTokenOptionsSection(
        t('tokens.selector.section.popular'),
        currencyInfosToTokenOptions(popularTokens?.map(gqlTokenToCurrencyInfo)),
      ) ?? []),
    ],
    [onPressClearSearchHistory, popularTokens, searchHistory, t],
  )

  return useMemo(
    () => ({
      data: sections,
      loading,
    }),
    [loading, sections],
  )
}

function _TokenSelectorEmptySearchList({ onSelectCurrency }: { onSelectCurrency: OnSelectCurrency }): JSX.Element {
  const { t } = useTranslation()

  const { data: sections, loading, error, refetch } = useTokenSectionsForEmptySearch()

  return (
    <TokenSelectorList
      showTokenAddress
      errorText={t('token.selector.search.error')}
      hasError={Boolean(error)}
      loading={loading}
      refetch={refetch}
      sections={sections}
      showTokenWarnings={true}
      onSelectCurrency={onSelectCurrency}
    />
  )
}

export const TokenSelectorEmptySearchList = memo(_TokenSelectorEmptySearchList)

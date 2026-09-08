import { GqlResult } from '@universe/api'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TokenOption } from 'uniswap/src/components/lists/items/types'
import { type OnchainItemSection, OnchainItemSectionName } from 'uniswap/src/components/lists/OnchainItemList/types'
import { useOnchainItemListSection } from 'uniswap/src/components/lists/utils'
import { useCurrencyInfosToTokenOptions } from 'uniswap/src/components/TokenSelector/hooks/useCurrencyInfosToTokenOptions'
import { usePortfolioBalancesForAddressById } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioBalancesForAddressById'
import { usePortfolioTokenOptions } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioTokenOptions'
import { mergeSearchResultsWithBridgingTokens } from 'uniswap/src/components/TokenSelector/utils'
import { TradeableAsset } from 'uniswap/src/entities/assets'
import type { AddressGroup } from 'uniswap/src/features/accounts/store/types/AccountsState'
import { useBridgingTokensOptions } from 'uniswap/src/features/bridging/hooks/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getChainLabel, isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useSearchTokens } from 'uniswap/src/features/dataApi/searchTokens'
import type { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { useLocalChainTokens } from 'uniswap/src/components/TokenSelector/hooks/useLocalChainTokens'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

export function useTokenSectionsForSearchResults({
  addresses,
  chainFilter,
  searchFilter,
  isBalancesOnlySearch,
  input,
  supportedBridgingChains: _supportedBridgingChains,
}: {
  addresses: AddressGroup
  chainFilter: UniverseChainId | null
  searchFilter: string | null
  isBalancesOnlySearch: boolean
  input?: TradeableAsset
  /** Optional list of chains to restrict bridging tokens to (e.g., for RigoBlock smart pools) */
  supportedBridgingChains?: UniverseChainId[]
}): GqlResult<OnchainItemSection<TokenOption>[]> {
  const { t } = useTranslation()

  const portfolioData = usePortfolioBalancesForAddressById(addresses)
  const {
    data: portfolioBalancesById,
    error: portfolioBalancesByIdError,
    refetch: refetchPortfolioBalances,
    loading: portfolioBalancesByIdLoading,
  } = portfolioData

  const {
    data: portfolioTokenOptions,
    error: portfolioTokenOptionsError,
    refetch: refetchPortfolioTokenOptions,
    loading: portfolioTokenOptionsLoading,
  } = usePortfolioTokenOptions({
    chainFilter,
    searchFilter: searchFilter ?? undefined,
    portfolioData,
  })

  // Bridging tokens are only shown if input is provided
  const {
    data: bridgingTokenOptions,
    error: bridgingTokenOptionsError,
    refetch: refetchBridgingTokenOptions,
    loading: bridgingTokenOptionsLoading,
  } = useBridgingTokensOptions({
    oppositeSelectedToken: input,
    chainFilter,
    portfolioData,
  })

  // Chains without backend support (e.g. HyperEVM) are not indexed — the search
  // endpoint would fail, so we match locally against the chain's configured tokens.
  const isChainIndexed = !chainFilter || isBackendSupportedChainId(chainFilter)
  const localChainTokens = useLocalChainTokens(chainFilter)

  // Only call search endpoint if isBalancesOnlySearch is false
  const {
    data: searchResultCurrencies,
    error: searchTokensError,
    refetch: refetchSearchTokens,
    loading: searchTokensLoading,
  } = useSearchTokens({
    searchQuery: searchFilter,
    chainFilter,
    skip: isBalancesOnlySearch || !isChainIndexed,
    hideWSOL: true, // Hide WSOL in token selector
  })

  const localSearchResults = useMemo(() => {
    if (isChainIndexed || !searchFilter) {
      return []
    }
    const query = searchFilter.trim().toLowerCase()
    if (!query) {
      return []
    }
    const isAddressQuery = query.startsWith('0x') && query.length === 42
    return localChainTokens.filter((token: CurrencyInfo) => {
      const { currency } = token
      return (
        currency.symbol?.toLowerCase().includes(query) ||
        currency.name?.toLowerCase().includes(query) ||
        (isAddressQuery &&
          !currency.isNative &&
          areAddressesEqual({
            addressInput1: { address: currency.address, chainId: currency.chainId },
            addressInput2: { address: searchFilter.trim(), chainId: currency.chainId },
          }))
      )
    })
  }, [isChainIndexed, localChainTokens, searchFilter])

  const [selectedNetworkResults, otherNetworksSearchResults] = useMemo((): [CurrencyInfo[], CurrencyInfo[]] => {
    if (!searchResultCurrencies) {
      return [[], []]
    }

    const selected = searchResultCurrencies.filter((currency) => !currency.isFromOtherNetwork)
    const other = searchResultCurrencies.filter((currency) => currency.isFromOtherNetwork)

    return [selected, other]
  }, [searchResultCurrencies])

  const searchResults = useCurrencyInfosToTokenOptions({
    currencyInfos: selectedNetworkResults,
    portfolioBalancesById,
  })

  // Format other networks search results if they exist
  const otherNetworksResults = useCurrencyInfosToTokenOptions({
    currencyInfos: otherNetworksSearchResults,
    portfolioBalancesById,
  })

  const loading =
    portfolioTokenOptionsLoading ||
    portfolioBalancesByIdLoading ||
    (!isBalancesOnlySearch && isChainIndexed && searchTokensLoading) ||
    bridgingTokenOptionsLoading

  const localSearchTokenOptions = useCurrencyInfosToTokenOptions({
    currencyInfos: localSearchResults,
    portfolioBalancesById,
  })

  const searchResultsSections = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.SearchResults,
    // Use local search when only searching balances
    options: isBalancesOnlySearch ? portfolioTokenOptions : isChainIndexed ? searchResults : localSearchTokenOptions,
  })

  // Create section for other chains search results if they exist
  const otherNetworksSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.OtherChainsTokens,
    options: otherNetworksResults,
  })

  // If there are bridging options, we need to extract them from the search results and then prepend them as a new section above.
  // The remaining non-bridging search results will be shown in a section with a different name
  const networkName = chainFilter ? getChainLabel(chainFilter) : undefined
  const searchResultsSectionHeader = networkName
    ? t('tokens.selector.section.otherSearchResults', { network: networkName })
    : undefined

  const allSections = useMemo(() => {
    // Start with existing sections (bridging tokens + search results)
    const sections =
      mergeSearchResultsWithBridgingTokens({
        searchResults: searchResultsSections,
        bridgingTokens: bridgingTokenOptions,
        sectionHeaderString: searchResultsSectionHeader,
      }) ?? []

    // Add other networks section if it exists
    if (otherNetworksSection?.length) {
      sections.push(...otherNetworksSection)
    }

    return sections
  }, [searchResultsSections, bridgingTokenOptions, searchResultsSectionHeader, otherNetworksSection])

  const error =
    (!bridgingTokenOptions && bridgingTokenOptionsError) ||
    (!portfolioBalancesById && portfolioBalancesByIdError) ||
    (!portfolioTokenOptions && portfolioTokenOptionsError) ||
    (!isBalancesOnlySearch && !searchResults && searchTokensError)

  const refetchAll = useCallback(() => {
    refetchPortfolioBalances?.()
    refetchSearchTokens?.()
    refetchPortfolioTokenOptions?.()
    refetchBridgingTokenOptions?.()
  }, [refetchBridgingTokenOptions, refetchPortfolioBalances, refetchPortfolioTokenOptions, refetchSearchTokens])

  return useMemo(
    () => ({
      data: allSections,
      loading,
      error: error || undefined,
      refetch: refetchAll,
    }),
    [error, loading, refetchAll, allSections],
  )
}

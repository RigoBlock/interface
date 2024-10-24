import { Currency } from '@uniswap/sdk-core'
import { hasStringAsync } from 'expo-clipboard'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea, isWeb, useMedia, useScrollbarStyles, useSporeColors } from 'ui/src'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { X } from 'ui/src/components/icons/X'
import { zIndices } from 'ui/src/theme'
import { TokenSelectorEmptySearchList } from 'uniswap/src/components/TokenSelector/TokenSelectorEmptySearchList'
import { TokenSelectorSearchResultsList } from 'uniswap/src/components/TokenSelector/TokenSelectorSearchResultsList'
import { TokenSelectorSendList } from 'uniswap/src/components/TokenSelector/TokenSelectorSendList'
import { TokenSelectorSwapInputList } from 'uniswap/src/components/TokenSelector/TokenSelectorSwapInputList'
import { TokenSelectorSwapOutputList } from 'uniswap/src/components/TokenSelector/TokenSelectorSwapOutputList'
import { flowToModalName } from 'uniswap/src/components/TokenSelector/flowToModalName'
import {
  ConvertFiatAmountFormattedCallback,
  FilterCallbacksHookType,
  TokenOptionsHookType,
  TokenOptionsWithBalanceOnlySearchHookType,
  TokenOptionsWithChainFilterHookType,
  TokenSection,
  TokenSectionsForEmptySearchHookType,
  TokenSelectorFlow,
  TokenWarningDismissedHook,
} from 'uniswap/src/components/TokenSelector/types'
import PasteButton from 'uniswap/src/components/buttons/PasteButton'
import { useBottomSheetContext } from 'uniswap/src/components/modals/BottomSheetContext'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter'
import { PortfolioValueModifier } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { FormatNumberOrStringInput } from 'uniswap/src/features/language/formatter'
import { SearchContext } from 'uniswap/src/features/search/SearchContext'
import { TokenSearchResult } from 'uniswap/src/features/search/SearchResult'
import { SearchTextInput } from 'uniswap/src/features/search/SearchTextInput'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { ElementName, ModalName, SectionName, UniswapEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import useIsKeyboardOpen from 'uniswap/src/hooks/useIsKeyboardOpen'
import { UniverseChainId } from 'uniswap/src/types/chains'
import { CurrencyField } from 'uniswap/src/types/currency'
import { getClipboard } from 'uniswap/src/utils/clipboard'
import { currencyAddress } from 'uniswap/src/utils/currencyId'
import { isExtension, isInterface, isMobileApp, isMobileWeb } from 'utilities/src/platform'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { useDebounce } from 'utilities/src/time/timing'

export const TOKEN_SELECTOR_WEB_MAX_WIDTH = 400

export enum TokenSelectorVariation {
  // used for Send flow, only show currencies with a balance
  BalancesOnly = 'balances-only',

  // used for Swap input. tokens with balances + popular
  BalancesAndPopular = 'balances-and-popular',

  // used for Swap output. suggested (common bases), favorites + popular (top tokens)
  SuggestedAndFavoritesAndPopular = 'suggested-and-favorites-and-popular',
}

export interface TokenSelectorProps {
  isModalOpen: boolean
  currencyField: CurrencyField
  flow: TokenSelectorFlow
  activeAccountAddress?: string
  chainId?: UniverseChainId
  valueModifiers?: PortfolioValueModifier[]
  searchHistory?: TokenSearchResult[]
  isSurfaceReady?: boolean
  isLimits?: boolean
  hideChainSwitch?: boolean
  onClose: () => void
  onDismiss: () => void
  onPressAnimation: () => void
  onSelectChain?: (chainId: UniverseChainId | null) => void
  onSelectCurrency: (currency: Currency, currencyField: CurrencyField, context: SearchContext) => void
  variation: TokenSelectorVariation
  addToSearchHistoryCallback: (currencyInfo: CurrencyInfo) => void
  navigateToBuyOrReceiveWithEmptyWalletCallback: () => void
  convertFiatAmountFormattedCallback: ConvertFiatAmountFormattedCallback
  formatNumberOrStringCallback: (input: FormatNumberOrStringInput) => string
  useTokenWarningDismissedHook: TokenWarningDismissedHook
  useCommonTokensOptionsHook: TokenOptionsHookType
  useFavoriteTokensOptionsHook: TokenOptionsHookType
  usePopularTokensOptionsHook: TokenOptionsWithChainFilterHookType
  usePortfolioTokenOptionsHook: TokenOptionsHookType
  useTokenSectionsForEmptySearchHook: TokenSectionsForEmptySearchHookType
  useTokenSectionsForSearchResultsHook: TokenOptionsWithBalanceOnlySearchHookType
  useFilterCallbacksHook: FilterCallbacksHookType
}

export function TokenSelectorContent({
  currencyField,
  flow,
  searchHistory,
  onSelectCurrency,
  chainId,
  valueModifiers,
  onClose,
  variation,
  isSurfaceReady = true,
  isLimits,
  hideChainSwitch,
  activeAccountAddress,
  onDismiss,
  onSelectChain,
  onPressAnimation,
  addToSearchHistoryCallback,
  convertFiatAmountFormattedCallback,
  formatNumberOrStringCallback,
  navigateToBuyOrReceiveWithEmptyWalletCallback,
  useCommonTokensOptionsHook,
  useFavoriteTokensOptionsHook,
  usePopularTokensOptionsHook,
  usePortfolioTokenOptionsHook,
  useTokenWarningDismissedHook,
  useTokenSectionsForEmptySearchHook,
  useTokenSectionsForSearchResultsHook,
  useFilterCallbacksHook,
}: Omit<TokenSelectorProps, 'isModalOpen'>): JSX.Element {
  const { onChangeChainFilter, onChangeText, searchFilter, chainFilter, parsedChainFilter, parsedSearchFilter } =
    useFilterCallbacksHook(chainId ?? null, flow)
  const debouncedSearchFilter = useDebounce(searchFilter)
  const debouncedParsedSearchFilter = useDebounce(parsedSearchFilter)
  const scrollbarStyles = useScrollbarStyles()
  const isKeyboardOpen = useIsKeyboardOpen()

  const media = useMedia()
  const isSmallScreen = (media.sm && isInterface) || isMobileApp || isMobileWeb

  const [hasClipboardString, setHasClipboardString] = useState(false)

  // Check if user clipboard has any text to show paste button
  useEffect(() => {
    async function checkClipboard(): Promise<void> {
      const result = await hasStringAsync()
      setHasClipboardString(result)
    }

    // Browser doesn't have permissions to access clipboard by default
    // so it will prompt the user to allow clipboard access which is
    // quite jarring and unnecessary.
    if (isInterface) {
      return
    }
    checkClipboard().catch(() => undefined)
  }, [])

  const { t } = useTranslation()
  const { page } = useTrace()

  // Log currency field only for Swap as for Transfer it's always input
  const currencyFieldName =
    flow === TokenSelectorFlow.Swap
      ? currencyField === CurrencyField.INPUT
        ? ElementName.TokenInputSelector
        : ElementName.TokenOutputSelector
      : undefined

  const onSelectCurrencyCallback = useCallback(
    (currencyInfo: CurrencyInfo, section: TokenSection, index: number): void => {
      const searchContext: SearchContext = {
        category: section.sectionKey,
        query: debouncedSearchFilter ?? undefined,
        position: index + 1,
        suggestionCount: section.data.length,
      }

      // log event that a currency was selected
      const tokenOption = section.data[index]
      const balanceUSD = Array.isArray(tokenOption) ? undefined : tokenOption?.balanceUSD ?? undefined
      sendAnalyticsEvent(UniswapEventName.TokenSelected, {
        name: currencyInfo.currency.name,
        address: currencyAddress(currencyInfo.currency),
        chain: currencyInfo.currency.chainId,
        modal: flowToModalName(flow),
        page,
        field: currencyField,
        token_balance_usd: balanceUSD,
        category: searchContext.category,
        position: searchContext.position,
        suggestion_count: searchContext.suggestionCount,
        query: searchContext.query,
      })

      onSelectCurrency(currencyInfo.currency, currencyField, searchContext)
    },
    [flow, page, currencyField, onSelectCurrency, debouncedSearchFilter],
  )

  const handlePaste = async (): Promise<void> => {
    const clipboardContent = await getClipboard()
    if (clipboardContent) {
      onChangeText(clipboardContent)
    }
  }

  const [searchInFocus, setSearchInFocus] = useState(false)

  const onSendEmptyActionPress = useCallback(() => {
    onClose()
    navigateToBuyOrReceiveWithEmptyWalletCallback()
  }, [navigateToBuyOrReceiveWithEmptyWalletCallback, onClose])

  function onCancel(): void {
    setSearchInFocus(false)
  }
  function onFocus(): void {
    if (!isWeb) {
      setSearchInFocus(true)
    }
  }

  const shouldAutoFocusSearch = isWeb && !media.sm

  const tokenSelector = useMemo(() => {
    if (searchInFocus && !searchFilter) {
      return (
        <TokenSelectorEmptySearchList
          chainFilter={chainFilter}
          convertFiatAmountFormattedCallback={convertFiatAmountFormattedCallback}
          formatNumberOrStringCallback={formatNumberOrStringCallback}
          isKeyboardOpen={isKeyboardOpen}
          useTokenSectionsForEmptySearchHook={useTokenSectionsForEmptySearchHook}
          useTokenWarningDismissedHook={useTokenWarningDismissedHook}
          onDismiss={onDismiss}
          onSelectCurrency={onSelectCurrencyCallback}
        />
      )
    }

    if (searchFilter) {
      return (
        <TokenSelectorSearchResultsList
          activeAccountAddress={activeAccountAddress}
          addToSearchHistoryCallback={addToSearchHistoryCallback}
          chainFilter={chainFilter}
          convertFiatAmountFormattedCallback={convertFiatAmountFormattedCallback}
          debouncedParsedSearchFilter={debouncedParsedSearchFilter}
          debouncedSearchFilter={debouncedSearchFilter}
          formatNumberOrStringCallback={formatNumberOrStringCallback}
          isBalancesOnlySearch={variation === TokenSelectorVariation.BalancesOnly}
          isKeyboardOpen={isKeyboardOpen}
          parsedChainFilter={parsedChainFilter}
          searchFilter={searchFilter}
          useTokenSectionsForSearchResultsHook={useTokenSectionsForSearchResultsHook}
          useTokenWarningDismissedHook={useTokenWarningDismissedHook}
          valueModifiers={valueModifiers}
          onDismiss={onDismiss}
          onSelectCurrency={onSelectCurrencyCallback}
        />
      )
    }

    switch (variation) {
      case TokenSelectorVariation.BalancesOnly:
        return (
          <TokenSelectorSendList
            activeAccountAddress={activeAccountAddress}
            chainFilter={chainFilter}
            convertFiatAmountFormattedCallback={convertFiatAmountFormattedCallback}
            formatNumberOrStringCallback={formatNumberOrStringCallback}
            isKeyboardOpen={isKeyboardOpen}
            searchHistory={searchHistory}
            usePortfolioTokenOptionsHook={usePortfolioTokenOptionsHook}
            useTokenWarningDismissedHook={useTokenWarningDismissedHook}
            valueModifiers={valueModifiers}
            onDismiss={onDismiss}
            onEmptyActionPress={onSendEmptyActionPress}
            onSelectCurrency={onSelectCurrencyCallback}
          />
        )
      case TokenSelectorVariation.BalancesAndPopular:
        return (
          <TokenSelectorSwapInputList
            activeAccountAddress={activeAccountAddress}
            chainFilter={chainFilter}
            convertFiatAmountFormattedCallback={convertFiatAmountFormattedCallback}
            formatNumberOrStringCallback={formatNumberOrStringCallback}
            isKeyboardOpen={isKeyboardOpen}
            searchHistory={searchHistory}
            useFavoriteTokensOptionsHook={useFavoriteTokensOptionsHook}
            usePopularTokensOptionsHook={usePopularTokensOptionsHook}
            usePortfolioTokenOptionsHook={usePortfolioTokenOptionsHook}
            useTokenWarningDismissedHook={useTokenWarningDismissedHook}
            valueModifiers={valueModifiers}
            onDismiss={onDismiss}
            onSelectCurrency={onSelectCurrencyCallback}
          />
        )
      case TokenSelectorVariation.SuggestedAndFavoritesAndPopular:
        return (
          <TokenSelectorSwapOutputList
            activeAccountAddress={activeAccountAddress}
            chainFilter={chainFilter}
            convertFiatAmountFormattedCallback={convertFiatAmountFormattedCallback}
            formatNumberOrStringCallback={formatNumberOrStringCallback}
            isKeyboardOpen={isKeyboardOpen}
            searchHistory={searchHistory}
            useCommonTokensOptionsHook={useCommonTokensOptionsHook}
            useFavoriteTokensOptionsHook={useFavoriteTokensOptionsHook}
            usePopularTokensOptionsHook={usePopularTokensOptionsHook}
            usePortfolioTokenOptionsHook={usePortfolioTokenOptionsHook}
            useTokenWarningDismissedHook={useTokenWarningDismissedHook}
            valueModifiers={valueModifiers}
            onDismiss={onDismiss}
            onSelectCurrency={onSelectCurrencyCallback}
          />
        )
    }
  }, [
    searchInFocus,
    searchFilter,
    searchHistory,
    variation,
    activeAccountAddress,
    isKeyboardOpen,
    chainFilter,
    parsedChainFilter,
    debouncedSearchFilter,
    debouncedParsedSearchFilter,
    valueModifiers,
    onDismiss,
    addToSearchHistoryCallback,
    convertFiatAmountFormattedCallback,
    formatNumberOrStringCallback,
    onSelectCurrencyCallback,
    onSendEmptyActionPress,
    useCommonTokensOptionsHook,
    useFavoriteTokensOptionsHook,
    usePopularTokensOptionsHook,
    usePortfolioTokenOptionsHook,
    useTokenSectionsForEmptySearchHook,
    useTokenSectionsForSearchResultsHook,
    useTokenWarningDismissedHook,
  ])

  return (
    <>
      <Trace logImpression element={currencyFieldName} section={SectionName.TokenSelector}>
        <Flex grow gap="$spacing8" style={scrollbarStyles}>
          {!isSmallScreen && (
            <Flex row justifyContent="space-between" pt="$spacing16" px="$spacing16">
              <Text variant="subheading1">{t('common.selectToken.label')}</Text>
              <TouchableArea onPress={onClose}>
                <X color="$neutral1" size="$icon.24" />
              </TouchableArea>
            </Flex>
          )}
          <Flex px="$spacing16" py="$spacing4">
            <SearchTextInput
              autoFocus={shouldAutoFocusSearch}
              backgroundColor="$surface2"
              endAdornment={
                <Flex row alignItems="center">
                  {hasClipboardString && <PasteButton inline onPress={handlePaste} />}
                  {!hideChainSwitch && (
                    <NetworkFilter
                      includeAllNetworks
                      selectedChain={chainFilter}
                      styles={isExtension ? { dropdownZIndex: zIndices.overlay } : undefined}
                      onDismiss={onDismiss}
                      onPressAnimation={onPressAnimation}
                      onPressChain={(newChainId) => {
                        onChangeChainFilter(newChainId)
                        onSelectChain?.(newChainId)
                      }}
                    />
                  )}
                </Flex>
              }
              placeholder={t('tokens.selector.search.placeholder')}
              px="$spacing16"
              py="$none"
              value={searchFilter ?? ''}
              onCancel={isWeb ? undefined : onCancel}
              onChangeText={onChangeText}
              onDismiss={onDismiss}
              onFocus={onFocus}
            />
          </Flex>
          {isLimits && (
            <Flex
              row
              backgroundColor="$surface2"
              borderRadius="$rounded12"
              gap="$spacing12"
              mx="$spacing8"
              p="$spacing12"
            >
              <InfoCircleFilled color="$neutral2" size="$icon.20" />
              <Text variant="body3">{t('limits.form.disclaimer.mainnet.short')}</Text>
            </Flex>
          )}
          {isSurfaceReady && <Flex grow>{tokenSelector}</Flex>}
        </Flex>
      </Trace>
    </>
  )
}

function TokenSelectorModalContent(props: TokenSelectorProps): JSX.Element {
  const { isSheetReady } = useBottomSheetContext()

  const { isModalOpen, onDismiss } = props

  useEffect(() => {
    if (isModalOpen) {
      // Dismiss native keyboard when opening modal in case it was opened by the current screen.
      onDismiss()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen])

  return <TokenSelectorContent {...props} isSurfaceReady={isSheetReady} />
}

function _TokenSelectorModal(props: TokenSelectorProps): JSX.Element {
  const colors = useSporeColors()
  const { isModalOpen, onClose } = props

  return (
    <Modal
      extendOnKeyboardVisible
      fullScreen
      hideKeyboardOnDismiss
      hideKeyboardOnSwipeDown
      renderBehindBottomInset
      backgroundColor={colors.surface1.val}
      isModalOpen={isModalOpen}
      maxWidth={isWeb ? TOKEN_SELECTOR_WEB_MAX_WIDTH : undefined}
      name={ModalName.TokenSelector}
      padding="$none"
      snapPoints={['65%', '100%']}
      onClose={onClose}
    >
      <TokenSelectorModalContent {...props} />
    </Modal>
  )
}

export const TokenSelectorModal = memo(_TokenSelectorModal)

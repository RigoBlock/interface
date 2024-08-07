import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, TextInput } from 'react-native'
import { FadeIn, FadeOut, FadeOutDown } from 'react-native-reanimated'
import { useAppDispatch, useShouldShowNativeKeyboard } from 'src/app/hooks'
import { FiatOnRampCtaButton } from 'src/components/fiatOnRamp/CtaButton'
import { FiatOnRampAmountSection } from 'src/features/fiatOnRamp/FiatOnRampAmountSection'
import { FiatOnRampTokenSelectorModal } from 'src/features/fiatOnRamp/FiatOnRampTokenSelector'
import { useMoonpayFiatOnRamp, useMoonpaySupportedTokens } from 'src/features/fiatOnRamp/hooks'
import { closeModal } from 'src/features/modals/modalSlice'
import { Flex, Text, useDeviceInsets, useSporeColors } from 'ui/src'
import MoonpayLogo from 'ui/src/assets/logos/svg/moonpay.svg'
import { AnimatedFlex } from 'ui/src/components/layout/AnimatedFlex'
import { TextInputProps } from 'uniswap/src/components/input/TextInput'
import { useBottomSheetContext } from 'uniswap/src/components/modals/BottomSheetContext'
import { BottomSheetModal } from 'uniswap/src/components/modals/BottomSheetModal'
import { HandleBar } from 'uniswap/src/components/modals/HandleBar'
import { getNativeAddress } from 'uniswap/src/constants/addresses'
import { FiatOnRampConnectingView } from 'uniswap/src/features/fiatOnRamp/FiatOnRampConnectingView'
import { ServiceProviderLogoStyles } from 'uniswap/src/features/fiatOnRamp/constants'
import { FiatOnRampCurrency } from 'uniswap/src/features/fiatOnRamp/types'
import { FiatOnRampEventName, ModalName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { UniverseEventProperties } from 'uniswap/src/features/telemetry/types'
import { UniverseChainId } from 'uniswap/src/types/chains'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'
import { NumberType } from 'utilities/src/format/types'
import { useTimeout } from 'utilities/src/time/timing'
import { DecimalPadLegacy } from 'wallet/src/components/legacy/DecimalPadLegacy'
import { useLocalFiatToUSDConverter } from 'wallet/src/features/fiatCurrency/hooks'
import { useMoonpayFiatCurrencySupportInfo } from 'wallet/src/features/fiatOnRamp/hooks'
import { useLocalizationContext } from 'wallet/src/features/language/LocalizationContext'
import { useCurrencyInfo } from 'wallet/src/features/tokens/useCurrencyInfo'
import { openUri } from 'wallet/src/utils/linking'

const MOONPAY_UNSUPPORTED_REGION_HELP_URL =
  'https://support.uniswap.org/hc/en-us/articles/11306664890381-Why-isn-t-MoonPay-available-in-my-region-'

const PREDEFINED_AMOUNTS_SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD']

const CONNECTING_TIMEOUT = 2000

export function FiatOnRampModal(): JSX.Element {
  const colors = useSporeColors()

  const dispatch = useAppDispatch()
  const onClose = useCallback((): void => {
    dispatch(closeModal({ name: ModalName.FiatOnRamp }))
  }, [dispatch])

  return (
    <BottomSheetModal
      fullScreen
      hideHandlebar
      hideKeyboardOnDismiss
      renderBehindTopInset
      backgroundColor={colors.surface1.get()}
      name={ModalName.FiatOnRamp}
      onClose={onClose}
    >
      <FiatOnRampContent onClose={onClose} />
    </BottomSheetModal>
  )
}

function FiatOnRampContent({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const { formatNumberOrString } = useLocalizationContext()
  const inputRef = useRef<TextInput>(null)

  const { isSheetReady } = useBottomSheetContext()

  const [showConnectingToMoonpayScreen, setShowConnectingToMoonpayScreen] = useState(false)

  const { showNativeKeyboard, onDecimalPadLayout, isLayoutPending, onInputPanelLayout } = useShouldShowNativeKeyboard()

  const [selection, setSelection] = useState<TextInputProps['selection']>()

  const resetSelection = (start: number, end?: number): void => {
    setSelection({ start, end: end ?? start })
  }

  const [value, setValue] = useState('')

  // We hardcode ETH as the starting currency
  const ethCurrencyInfo = useCurrencyInfo(
    buildCurrencyId(UniverseChainId.Mainnet, getNativeAddress(UniverseChainId.Mainnet)),
  )

  const [currency, setCurrency] = useState<FiatOnRampCurrency>({
    currencyInfo: ethCurrencyInfo,
    moonpayCurrencyCode: 'eth',
  })

  const { appFiatCurrencySupportedInMoonpay, moonpaySupportedFiatCurrency } = useMoonpayFiatCurrencySupportInfo()

  // We only support predefined amounts for certain currencies.
  // If the user's app fiat currency is not supported in Moonpay,
  // we fallback to USD (which does allow for predefined amounts)
  const predefinedAmountsSupported =
    PREDEFINED_AMOUNTS_SUPPORTED_CURRENCIES.includes(moonpaySupportedFiatCurrency.code) ||
    !appFiatCurrencySupportedInMoonpay

  // We might not have ethCurrencyInfo when this component is initially rendered.
  // If `ethCurrencyInfo` becomes available later while currency.currencyInfo is still unset, we update the currency state accordingly.
  useEffect(() => {
    if (ethCurrencyInfo && !currency.currencyInfo) {
      setCurrency({ ...currency, currencyInfo: ethCurrencyInfo })
    }
  }, [currency, currency.currencyInfo, ethCurrencyInfo])

  const {
    eligible,
    quoteAmount,
    isLoading,
    isError,
    externalTransactionId,
    dispatchAddTransaction,
    fiatOnRampHostUrl,
    quoteCurrencyAmountReady,
    quoteCurrencyAmountLoading,
    errorText,
    errorColor,
  } = useMoonpayFiatOnRamp({
    baseCurrencyAmount: value,
    quoteCurrencyCode: currency.moonpayCurrencyCode,
    quoteChainId: currency.currencyInfo?.currency.chainId ?? UniverseChainId.Mainnet,
  })

  useTimeout(
    async () => {
      if (fiatOnRampHostUrl) {
        if (currency?.moonpayCurrencyCode) {
          sendAnalyticsEvent(FiatOnRampEventName.FiatOnRampWidgetOpened, {
            externalTransactionId,
            serviceProvider: 'MOONPAY',
            fiatCurrency: moonpaySupportedFiatCurrency.code.toLowerCase(),
            cryptoCurrency: currency.moonpayCurrencyCode.toLowerCase(),
          })
        }
        await openUri(fiatOnRampHostUrl)
        dispatchAddTransaction()
        onClose()
      }
    },
    // setTimeout would be called inside this hook, only when delay >= 0
    showConnectingToMoonpayScreen ? CONNECTING_TIMEOUT : -1,
  )

  const buttonEnabled = !isLoading && (!eligible || (!isError && fiatOnRampHostUrl && quoteCurrencyAmountReady))

  const fiatToUSDConverter = useLocalFiatToUSDConverter()

  const onChangeValue =
    (source: UniverseEventProperties[FiatOnRampEventName.FiatOnRampAmountEntered]['source']) =>
    (newAmount: string): void => {
      sendAnalyticsEvent(FiatOnRampEventName.FiatOnRampAmountEntered, {
        source,
        amountUSD: fiatToUSDConverter(parseFloat(newAmount)),
      })
      setValue(newAmount)
    }

  const [showTokenSelector, setShowTokenSelector] = useState(false)

  useEffect(() => {
    if (showTokenSelector) {
      // hide keyboard when user goes to token selector screen
      inputRef.current?.blur()
    } else if (showNativeKeyboard && eligible) {
      // autofocus
      inputRef.current?.focus()
    }
  }, [showNativeKeyboard, eligible, showTokenSelector])

  const selectTokenLoading = quoteCurrencyAmountLoading && !errorText && !!value

  const {
    list: supportedTokensList,
    loading: supportedTokensLoading,
    error: supportedTokensError,
    refetch: supportedTokensRefetch,
  } = useMoonpaySupportedTokens()

  const insets = useDeviceInsets()

  const onSelectCurrency = (newCurrency: FiatOnRampCurrency): void => {
    setCurrency(newCurrency)
    setShowTokenSelector(false)
    if (newCurrency.currencyInfo?.currency.symbol) {
      sendAnalyticsEvent(FiatOnRampEventName.FiatOnRampTokenSelected, {
        token: newCurrency.currencyInfo.currency.symbol.toLowerCase(),
      })
    }
  }

  return (
    <Flex grow pt={showConnectingToMoonpayScreen ? undefined : insets.top}>
      {!showConnectingToMoonpayScreen && (
        <AnimatedFlex row height="100%" pb="$spacing12">
          {isSheetReady && (
            <AnimatedFlex
              entering={FadeIn}
              exiting={FadeOut}
              gap="$spacing16"
              pb="$spacing16"
              px="$spacing24"
              width="100%"
            >
              <HandleBar backgroundColor="none" />
              <Text variant="subheading1">{t('common.button.buy')}</Text>
              <FiatOnRampAmountSection
                appFiatCurrencySupported={appFiatCurrencySupportedInMoonpay}
                currency={currency}
                disabled={!eligible}
                errorColor={errorColor}
                errorText={errorText}
                fiatCurrencyInfo={moonpaySupportedFiatCurrency}
                inputRef={inputRef}
                predefinedAmountsSupported={predefinedAmountsSupported}
                quoteAmount={quoteAmount}
                quoteCurrencyAmountReady={quoteCurrencyAmountReady}
                selectTokenLoading={selectTokenLoading}
                setSelection={setSelection}
                showNativeKeyboard={showNativeKeyboard}
                showSoftInputOnFocus={showNativeKeyboard}
                value={value}
                onChoosePredifendAmount={onChangeValue('chip')}
                onEnterAmount={onChangeValue('textInput')}
                onInputPanelLayout={onInputPanelLayout}
                onTokenSelectorPress={(): void => {
                  setShowTokenSelector(true)
                }}
              />
              <AnimatedFlex
                bottom={0}
                exiting={FadeOutDown}
                gap="$spacing8"
                left={0}
                opacity={isLayoutPending ? 0 : 1}
                position="absolute"
                px="$spacing24"
                right={0}
                onLayout={onDecimalPadLayout}
              >
                {!showNativeKeyboard && (
                  <DecimalPadLegacy
                    resetSelection={resetSelection}
                    selection={selection}
                    setValue={onChangeValue('textInput')}
                    value={value}
                  />
                )}
                <FiatOnRampCtaButton
                  continueButtonText={
                    appFiatCurrencySupportedInMoonpay
                      ? t('fiatOnRamp.button.continueCheckout')
                      : t('fiatOnRamp.checkout.button')
                  }
                  disabled={!buttonEnabled}
                  eligible={eligible}
                  isLoading={isLoading}
                  onPress={async (): Promise<void> => {
                    if (eligible) {
                      setShowConnectingToMoonpayScreen(true)
                    } else {
                      await openUri(MOONPAY_UNSUPPORTED_REGION_HELP_URL)
                    }
                  }}
                />
              </AnimatedFlex>
            </AnimatedFlex>
          )}
          {showTokenSelector && (
            <FiatOnRampTokenSelectorModal
              error={supportedTokensError}
              list={supportedTokensList}
              loading={supportedTokensLoading}
              onClose={(): void => setShowTokenSelector(false)}
              onRetry={supportedTokensRefetch}
              onSelectCurrency={onSelectCurrency}
            />
          )}
        </AnimatedFlex>
      )}
      {showConnectingToMoonpayScreen && (
        <FiatOnRampConnectingView
          amount={formatNumberOrString({
            value,
            type: NumberType.FiatTokenPrice,
            currencyCode: moonpaySupportedFiatCurrency.code,
          })}
          quoteCurrencyCode={currency.currencyInfo?.currency.symbol}
          serviceProviderLogo={
            <Flex
              alignItems="center"
              borderRadius="$rounded20"
              height={ServiceProviderLogoStyles.icon.height}
              justifyContent="center"
              style={styles.moonpayLogoWrapper}
              width={ServiceProviderLogoStyles.icon.width}
            >
              <MoonpayLogo
                height={ServiceProviderLogoStyles.icon.height}
                width={ServiceProviderLogoStyles.icon.width}
              />
            </Flex>
          }
          serviceProviderName="MoonPay"
        />
      )}
    </Flex>
  )
}

const styles = StyleSheet.create({
  moonpayLogoWrapper: {
    backgroundColor: '#7D00FF',
  },
})

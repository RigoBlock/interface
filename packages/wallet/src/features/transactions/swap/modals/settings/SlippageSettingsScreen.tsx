import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea, isWeb, useSporeColors } from 'ui/src'
import { AnimatedFlex } from 'ui/src/components/layout/AnimatedFlex'
import { fonts, iconSizes, spacing } from 'ui/src/theme'
import { BottomSheetTextInput } from 'uniswap/src/components/modals/BottomSheetModal'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import PlusMinusButton, { PlusMinusButtonType } from 'wallet/src/components/buttons/PlusMinusButton'
import { LearnMoreLink } from 'wallet/src/components/text/LearnMoreLink'
import { MAX_CUSTOM_SLIPPAGE_TOLERANCE } from 'wallet/src/constants/transactions'
import { SwapSettingsMessage } from 'wallet/src/features/transactions/swap/modals/settings/SwapSettingsMessage'
import { useSlippageSettings } from 'wallet/src/features/transactions/swap/modals/settings/useSlippageSettings'
import { DerivedSwapInfo } from 'wallet/src/features/transactions/swap/types'

export type SlippageSettingsScreen = {
  derivedSwapInfo: DerivedSwapInfo
  setCustomSlippageTolerance: (newCustomeSlippageTolerance: number | undefined) => void
}
export function SlippageSettingsScreen({
  derivedSwapInfo,
  onSlippageChange,
}: {
  derivedSwapInfo: DerivedSwapInfo
  onSlippageChange: (slippage: number | undefined) => void
}): JSX.Element {
  const { t } = useTranslation()
  const colors = useSporeColors()

  const {
    trade,
    isEditingSlippage,
    autoSlippageEnabled,
    showSlippageWarning,
    inputSlippageTolerance,
    inputWarning,
    autoSlippageTolerance,
    currentSlippageTolerance,
    inputAnimatedStyle,
    onPressAutoSlippage,
    onChangeSlippageInput,
    onFocusSlippageInput,
    onBlurSlippageInput,
    onPressPlusMinusButton,
  } = useSlippageSettings({ derivedSwapInfo, onSlippageChange })

  return (
    <Flex centered gap="$spacing16">
      <Text color="$neutral2" textAlign="center" variant="body2">
        {t('swap.settings.slippage.description')}
      </Text>
      <LearnMoreLink url={uniswapUrls.helpArticleUrls.swapSlippage} />
      <Flex gap="$spacing12">
        <Flex centered row gap="$spacing16" mt="$spacing12">
          <PlusMinusButton
            disabled={currentSlippageTolerance === 0}
            type={PlusMinusButtonType.Minus}
            onPress={onPressPlusMinusButton}
          />
          <AnimatedFlex
            row
            alignItems="center"
            backgroundColor={isEditingSlippage ? '$surface2' : '$surface1'}
            borderColor="$surface3"
            borderRadius="$roundedFull"
            borderWidth={1}
            gap="$spacing12"
            p="$spacing16"
            style={inputAnimatedStyle}
          >
            <TouchableArea hapticFeedback onPress={onPressAutoSlippage}>
              <Text color="$accent1" variant="buttonLabel3">
                {t('swap.settings.slippage.control.auto')}
              </Text>
            </TouchableArea>
            <BottomSheetTextInput
              keyboardType="numeric"
              style={{
                color: autoSlippageEnabled ? colors.neutral2.get() : colors.neutral1.get(),
                fontSize: fonts.subheading1.fontSize,
                width: fonts.subheading1.fontSize * 4,
                padding: spacing.none,
                ...(!isWeb && {
                  fontFamily: fonts.subheading1.family,
                }),
              }}
              textAlign="center"
              value={autoSlippageEnabled ? autoSlippageTolerance.toFixed(2).toString() : inputSlippageTolerance}
              onBlur={onBlurSlippageInput}
              onChangeText={onChangeSlippageInput}
              onFocus={onFocusSlippageInput}
            />
            <Flex width={iconSizes.icon28}>
              <Text color="$neutral2" textAlign="center" variant="subheading1">
                %
              </Text>
            </Flex>
          </AnimatedFlex>
          <PlusMinusButton
            disabled={currentSlippageTolerance === MAX_CUSTOM_SLIPPAGE_TOLERANCE}
            type={PlusMinusButtonType.Plus}
            onPress={onPressPlusMinusButton}
          />
        </Flex>
        <SwapSettingsMessage
          inputWarning={inputWarning}
          showSlippageWarning={showSlippageWarning}
          slippageTolerance={currentSlippageTolerance}
          trade={trade}
        />
      </Flex>
    </Flex>
  )
}

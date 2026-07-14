import type { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Flex, Text, type TextProps, TouchableArea, type TouchableAreaEvent } from 'ui/src'
import { useConnectionStatus } from 'uniswap/src/features/accounts/store/hooks'
import type { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { CurrencyField } from 'uniswap/src/types/currency'
import { getSymbolDisplayText } from 'uniswap/src/utils/currency'
import { NumberType } from 'utilities/src/format/types'
import { useEvent } from 'utilities/src/react/hooks'

interface CurrencyInputBalanceProps {
  currencyBalance: Maybe<CurrencyAmount<Currency>>
  currencyInfo: Maybe<CurrencyInfo>
  showInsufficientBalanceWarning: boolean
  currencyField: CurrencyField
  hideBalance: boolean
  variant?: TextProps['variant']
  onPressBalance?: () => void
  isSmartPool?: boolean
}
export function CurrencyInputPanelBalance({
  currencyBalance,
  currencyInfo,
  currencyField,
  showInsufficientBalanceWarning,
  hideBalance,
  variant = 'body3',
  onPressBalance,
  isSmartPool,
}: CurrencyInputBalanceProps): JSX.Element | null {
  const { formatCurrencyAmount } = useLocalizationContext()
  const { isDisconnected } = useConnectionStatus()
  const isOutput = currencyField === CurrencyField.OUTPUT

  // Hide balance if panel is output and has no balance, or the token selector is hidden.
  // For smart pools we still show the balance even when the user wallet is disconnected,
  // because the Swap tab always sources balances from the smart pool itself.
  const hideCurrencyBalance =
    (isOutput && currencyBalance?.equalTo(0)) || (!isSmartPool && isDisconnected) || hideBalance

  const color = showInsufficientBalanceWarning ? '$statusCritical' : '$neutral2'
  const hoverColor = showInsufficientBalanceWarning ? '$statusCriticalHovered' : '$neutral2Hovered'

  const handlePress = useEvent((event: TouchableAreaEvent) => {
    event.stopPropagation()
    onPressBalance?.()
  })

  if (!currencyInfo || hideCurrencyBalance) {
    return null
  }

  const balanceText = (
    <Text
      color={color}
      variant={variant}
      {...(onPressBalance && {
        '$group-item-hover': { color: hoverColor },
      })}
    >
      {formatCurrencyAmount({
        value: currencyBalance,
        type: NumberType.TokenTx,
      })}{' '}
      {getSymbolDisplayText(currencyInfo.currency.symbol)}
    </Text>
  )

  if (onPressBalance) {
    return (
      <TouchableArea group="item" cursor="pointer" onPress={handlePress}>
        <Flex row width="max-content">
          {balanceText}
        </Flex>
      </TouchableArea>
    )
  }

  return balanceText
}

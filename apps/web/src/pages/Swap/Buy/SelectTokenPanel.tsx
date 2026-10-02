import { Currency } from '@uniswap/sdk-core'
import { clickableStyle, Flex, type FlexCompatProps as FlexProps, iconSizes, Text } from '@universe/mycelium'
import { Chevron } from '@universe/mycelium/icons/Chevron'
import type { FC } from 'react'
import { CurrencyLogo } from 'uniswap/src/components/CurrencyLogo/CurrencyLogo'
import { PortfolioBalance } from 'uniswap/src/features/dataApi/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { NumberType } from 'utilities/src/format/types'

// Explicit type: the inferred arrow-function type isn't nameable under declaration emit (TS2883).
export const SelectTokenPanel: FC<{ currency?: Currency; balance?: PortfolioBalance } & FlexProps> = ({
  currency,
  balance,
  ...rest
}) => {
  const { convertFiatAmountFormatted, formatNumberOrString } = useLocalizationContext()
  const currencyInfo = useCurrencyInfo(currencyId(currency))

  return (
    <Flex
      row
      borderRadius="$rounded20"
      backgroundColor="$surface2"
      p="$spacing16"
      gap="$spacing12"
      alignItems="center"
      {...clickableStyle}
      {...rest}
    >
      <CurrencyLogo currencyInfo={currencyInfo} size={iconSizes.icon40} />
      <Flex grow>
        <Text color="$neutral1" loading={!currency}>
          {currency?.symbol}
        </Text>
        {balance && (
          <Flex row alignItems="center" gap="$spacing4">
            <Text color="$neutral2">
              {formatNumberOrString({ value: balance.quantity, type: NumberType.TokenNonTx })}
            </Text>
            <Text color="$neutral3">({convertFiatAmountFormatted(balance.balanceUSD, NumberType.FiatStandard)})</Text>
          </Flex>
        )}
      </Flex>
      <Chevron rotate="180deg" size="$icon.20" />
    </Flex>
  )
}

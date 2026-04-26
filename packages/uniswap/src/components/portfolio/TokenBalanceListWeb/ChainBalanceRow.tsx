import { memo } from 'react'
import { Flex, Text } from 'ui/src'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { getSymbolDisplayText } from 'uniswap/src/utils/currency'
import { NumberType } from 'utilities/src/format/types'

/** One chain under an expanded multichain parent (extension). */
export const ChainBalanceRow = memo(function ChainBalanceRowInner({
  chainId,
  symbol,
  quantity,
  valueUsd,
}: {
  chainId: number
  symbol: string | undefined
  quantity: number
  valueUsd: number | undefined
}): JSX.Element {
  const { formatNumberOrString, convertFiatAmountFormatted } = useLocalizationContext()
  const shortenedSymbol = getSymbolDisplayText(symbol)

  return (
    <Flex
      row
      alignItems="center"
      backgroundColor="$surface1"
      borderRadius="$rounded12"
      height={48}
      justifyContent="space-between"
      px="$spacing8"
      hoverStyle={{ backgroundColor: '$surface2' }}
    >
      <Flex row shrink alignItems="center" gap="$spacing12">
        <Flex centered width="$spacing40" height="$spacing40">
          <NetworkLogo chainId={chainId as UniverseChainId} size={24} />
        </Flex>
        <Text color="$neutral2" numberOfLines={1} variant="body3">
          {`${formatNumberOrString({ value: quantity })} ${shortenedSymbol}`}
        </Text>
      </Flex>
      <Text color="$neutral1" numberOfLines={1} variant="body3">
        {convertFiatAmountFormatted(valueUsd, NumberType.FiatTokenQuantity)}
      </Text>
    </Flex>
  )
})

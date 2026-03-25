import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Input, Text } from 'ui/src'
import { fonts } from 'ui/src/theme'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { type UniverseChainId } from 'uniswap/src/features/chains/types'
import { useAppFiatCurrencyInfo } from 'uniswap/src/features/fiatCurrency/hooks'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { useCurrencyInfo, useNativeCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { useUSDCPrice } from 'uniswap/src/features/transactions/hooks/useUSDCPriceWrapper'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'
import { NumberType } from 'utilities/src/format/types'
import { RaiseCurrency } from '~/pages/Liquidity/CreateAuction/types'

export function FloorPriceSection({
  chainId,
  floorPrice,
  raiseCurrency,
  tokenTotalSupply,
  onFloorPriceChange,
}: {
  chainId: UniverseChainId
  floorPrice: string
  raiseCurrency: RaiseCurrency
  tokenTotalSupply?: string
  onFloorPriceChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const mirrorRef = useRef<HTMLSpanElement>(null)
  const [inputWidth, setInputWidth] = useState<number | null>(null)

  const { convertFiatAmountFormatted, formatNumberOrString } = useLocalizationContext()
  const { code: fiatCurrencyCode } = useAppFiatCurrencyInfo()
  const locale = useCurrentLocale()

  const nativeCurrencyInfo = useNativeCurrencyInfo(chainId)
  const usdcCurrencyId = useMemo(() => {
    const usdc = getChainInfo(chainId).tokens.USDC
    return usdc ? buildCurrencyId(chainId, usdc.address) : undefined
  }, [chainId])
  const usdcCurrencyInfo = useCurrencyInfo(usdcCurrencyId, { skip: !usdcCurrencyId })

  const raiseCurrencyObj = useMemo(
    () => (raiseCurrency === RaiseCurrency.ETH ? nativeCurrencyInfo?.currency : usdcCurrencyInfo?.currency),
    [raiseCurrency, nativeCurrencyInfo?.currency, usdcCurrencyInfo?.currency],
  )

  const { price: raiseCurrencyUsdPrice } = useUSDCPrice(raiseCurrencyObj)

  const decimalSeparator = useMemo(
    () =>
      Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((p) => p.type === 'decimal')?.value ?? '.',
    [locale],
  )

  // Re-format the stored (dot-based) value for display in the user's locale.
  const displayValue = floorPrice.replace('.', decimalSeparator)

  const floorPriceNum = parseFloat(floorPrice)
  const totalSupplyNum = parseFloat(tokenTotalSupply ?? '')
  const hasValidInputs = Number.isFinite(floorPriceNum) && floorPriceNum > 0

  // FDV in raise currency shown in the pill: floorPrice × totalSupply
  const fdvRaiseCurrencyDisplay = useMemo(() => {
    if (!hasValidInputs || !Number.isFinite(totalSupplyNum)) {
      return null
    }
    const fdv = floorPriceNum * totalSupplyNum
    return formatNumberOrString({ value: fdv.toString(), type: NumberType.TokenNonTx })
  }, [hasValidInputs, floorPriceNum, totalSupplyNum, formatNumberOrString])

  // Floor price in user's local fiat currency shown below
  const floorPriceFiatDisplay = useMemo(() => {
    if (!hasValidInputs || !raiseCurrencyUsdPrice) {
      return convertFiatAmountFormatted(0, NumberType.FiatTokenPrice)
    }
    try {
      const priceNum = Number(raiseCurrencyUsdPrice.toSignificant(18))
      return convertFiatAmountFormatted(floorPriceNum * priceNum, NumberType.FiatTokenPrice)
    } catch {
      return convertFiatAmountFormatted(0, NumberType.FiatTokenPrice)
    }
  }, [hasValidInputs, floorPriceNum, raiseCurrencyUsdPrice, convertFiatAmountFormatted])

  const handleFloorPriceChange = useCallback(
    (value: string) => {
      // Normalize: replace the locale decimal separator with '.' so validation and
      // parseFloat always work with a canonical dot-based string. A literal '.' is
      // also accepted as a fallback so copy-pasted values work in any locale.
      const normalizedValue = decimalSeparator !== '.' ? value.replace(decimalSeparator, '.') : value
      if (!/^\d*\.?\d*$/.test(normalizedValue)) {
        return
      }
      const maxDecimals = raiseCurrencyObj?.decimals
      if (maxDecimals !== undefined) {
        const dotIndex = normalizedValue.indexOf('.')
        if (dotIndex !== -1 && normalizedValue.length - dotIndex - 1 > maxDecimals) {
          return
        }
      }
      onFloorPriceChange(normalizedValue)
    },
    [decimalSeparator, raiseCurrencyObj?.decimals, onFloorPriceChange],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: floorPrice is the trigger to re-measure the mirror span after it re-renders
  useLayoutEffect(() => {
    if (mirrorRef.current) {
      setInputWidth(mirrorRef.current.offsetWidth)
    }
  }, [floorPrice])

  return (
    <Flex gap="$spacing8">
      <Flex gap="$spacing4">
        <Text variant="subheading1" color="$neutral1">
          {t('toucan.createAuction.step.configureAuction.floorPrice')}
        </Text>
        <Text variant="body3" color="$neutral2">
          {t('toucan.createAuction.step.configureAuction.floorPrice.description')}
        </Text>
      </Flex>
      <Flex
        backgroundColor="$surface2"
        borderWidth={1}
        borderColor="$surface3"
        borderRadius="$rounded16"
        p="$spacing16"
        position="relative"
      >
        <Flex gap="$spacing4">
          <Flex row gap="$spacing8" alignItems="center" justifyContent="space-between">
            <Flex row gap="$spacing4" alignItems="center" flex={1} minWidth={0}>
              <Flex
                {...(inputWidth !== null ? { width: inputWidth + 2 } : { flex: 1 })}
                maxWidth="100%"
                flexShrink={1}
                minWidth={0}
                style={{ position: 'relative' }}
              >
                <Input
                  height={fonts.heading3.lineHeight}
                  width="100%"
                  value={displayValue}
                  onChangeText={handleFloorPriceChange}
                  placeholder={`0${decimalSeparator}00`}
                  placeholderTextColor="$neutral3"
                  keyboardType="decimal-pad"
                  fontSize={fonts.heading3.fontSize}
                  lineHeight={fonts.heading3.lineHeight}
                  fontWeight={fonts.heading3.fontWeight}
                  color="$neutral1"
                  px="$none"
                  backgroundColor="$transparent"
                />
                {/* Mirror span sized to content — measured synchronously in useLayoutEffect before paint */}
                <span
                  ref={mirrorRef}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    visibility: 'hidden',
                    whiteSpace: 'pre',
                    pointerEvents: 'none',
                    fontSize: fonts.heading3.fontSize,
                    fontWeight: String(fonts.heading3.fontWeight),
                    lineHeight: `${fonts.heading3.lineHeight}px`,
                  }}
                >
                  {displayValue || `0${decimalSeparator}00`}
                </span>
              </Flex>
              <Text variant="heading3" color="$neutral2" flexShrink={0}>
                {raiseCurrency}
              </Text>
            </Flex>
            {fdvRaiseCurrencyDisplay && (
              <Flex backgroundColor="$surface3" borderRadius="$roundedFull" p="$spacing8" flexShrink={0}>
                <Text variant="buttonLabel4" color="$neutral1">
                  {fdvRaiseCurrencyDisplay} {raiseCurrency} {t('stats.fdv')}
                </Text>
              </Flex>
            )}
          </Flex>
          <Text variant="subheading2" color="$neutral2">
            {`${floorPriceFiatDisplay} ${fiatCurrencyCode}`}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  )
}

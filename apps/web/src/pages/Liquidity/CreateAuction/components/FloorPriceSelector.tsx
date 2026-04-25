import { type Currency, type CurrencyAmount, Price } from '@uniswap/sdk-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Input, Text, TouchableArea } from 'ui/src'
import { fonts } from 'ui/src/theme'
import { type UniverseChainId } from 'uniswap/src/features/chains/types'
import { useAppFiatCurrencyInfo } from 'uniswap/src/features/fiatCurrency/hooks'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { useUSDCPrice } from 'uniswap/src/features/transactions/hooks/useUSDCPriceWrapper'
import { NumberType } from 'utilities/src/format/types'
import { RaiseCurrency } from '~/pages/Liquidity/CreateAuction/types'
import { getRaiseCurrencyAsCurrency } from '~/pages/Liquidity/CreateAuction/utils'

// Two independent axes:
//   denomination – what the numeric input represents (floor price per token, or FDV)
//   inputCurrency – the currency the user types in (raise token, or USD fiat)
type Denomination = 'floorPrice' | 'fdv'
type InputCurrency = 'raise' | 'usd'

/** Max fraction digits when typing USD-denominated values (fiat / USD FDV). */
const USD_DRAFT_MAX_DECIMALS = 8

// ─── Pure helpers (input normalization & floor price math) ───────────────────

function normalizeDecimalInput(value: string, decimalSeparator: string): string | null {
  const normalized = decimalSeparator !== '.' ? value.replace(decimalSeparator, '.') : value
  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null
  }
  return normalized
}

function exceedsDecimalCap(normalized: string, maxDecimals: number): boolean {
  const dotIndex = normalized.indexOf('.')
  return dotIndex !== -1 && normalized.length - dotIndex - 1 > maxDecimals
}

/** Normalizes JS arithmetic for decimal text fields (avoids float artifacts like 0.30000000000000004). */
function formatArithmeticResultForInput(n: number): string {
  if (!Number.isFinite(n)) {
    return ''
  }
  if (n === 0) {
    return '0'
  }
  const cleaned = Number.parseFloat(n.toPrecision(12))
  if (!Number.isFinite(cleaned)) {
    return ''
  }
  let s = cleaned.toString()
  if (s.includes('e') || s.includes('E')) {
    s = cleaned.toFixed(18).replace(/\.?0+$/, '') || '0'
  }
  return s === '-0' ? '0' : s
}

function maxDecimalsForDraftInput(inputCurrency: InputCurrency, raiseTokenDecimals: number | undefined): number {
  if (inputCurrency === 'usd') {
    return USD_DRAFT_MAX_DECIMALS
  }
  return raiseTokenDecimals ?? 18
}

/**
 * Single pipeline: draft string + mode + oracles → canonical floor price (raise token per auction token).
 * Used only for non–parent-controlled modes; parent-controlled commits directly in the change handler.
 */
function commitDraftToFloorPrice({
  localValue,
  denomination,
  inputCurrency,
  usdPriceNum,
  tokenTotalSupply,
  raiseCurrency,
}: {
  localValue: string
  denomination: Denomination
  inputCurrency: InputCurrency
  usdPriceNum: number | null
  tokenTotalSupply: CurrencyAmount<Currency>
  raiseCurrency: Currency | undefined
}): string {
  const trimmed = localValue.trim()
  if (!trimmed) {
    return ''
  }
  const num = parseFloat(trimmed)
  if (!Number.isFinite(num) || num <= 0) {
    return ''
  }

  if (tokenTotalSupply.equalTo(0)) {
    return ''
  }

  if (denomination === 'floorPrice' && inputCurrency === 'usd') {
    if (!usdPriceNum || usdPriceNum <= 0) {
      return ''
    }
    return formatArithmeticResultForInput(num / usdPriceNum)
  }

  if (denomination === 'fdv' && inputCurrency === 'raise') {
    if (!raiseCurrency) {
      return ''
    }
    const fdvAmount = getCurrencyAmount({
      value: trimmed,
      valueType: ValueType.Exact,
      currency: raiseCurrency,
    })
    if (!fdvAmount || fdvAmount.equalTo(0)) {
      return ''
    }
    try {
      const price = new Price({
        baseAmount: tokenTotalSupply,
        quoteAmount: fdvAmount,
      })
      return price.toSignificant(18)
    } catch {
      return ''
    }
  }

  // fdv + usd
  if (!usdPriceNum || usdPriceNum <= 0 || !raiseCurrency) {
    return ''
  }
  const fdvRaiseHuman = formatArithmeticResultForInput(num / usdPriceNum)
  if (!fdvRaiseHuman) {
    return ''
  }
  const fdvAmount = getCurrencyAmount({
    value: fdvRaiseHuman,
    valueType: ValueType.Exact,
    currency: raiseCurrency,
  })
  if (!fdvAmount || fdvAmount.equalTo(0)) {
    return ''
  }
  try {
    const price = new Price({
      baseAmount: tokenTotalSupply,
      quoteAmount: fdvAmount,
    })
    return price.toSignificant(18)
  } catch {
    return ''
  }
}

/**
 * Maps canonical floor price into the draft string for a *target* mode after a toggle.
 * Does not support `floorPrice + raise` (parent-controlled): that mode reads `floorPrice` from props;
 * callers must not pass that combination — it returns `''` by design.
 */
function getDisplayValueForMode({
  denomination,
  inputCurrency,
  floorPriceNum,
  totalSupplyNum,
  usdPriceNum,
  hasValidFloorPrice,
}: {
  denomination: Denomination
  inputCurrency: InputCurrency
  floorPriceNum: number
  totalSupplyNum: number
  usdPriceNum: number | null
  hasValidFloorPrice: boolean
}): string {
  if (!hasValidFloorPrice) {
    return ''
  }
  if (denomination === 'floorPrice' && inputCurrency === 'usd') {
    return usdPriceNum !== null ? formatArithmeticResultForInput(floorPriceNum * usdPriceNum) : ''
  }
  if (denomination === 'fdv' && inputCurrency === 'raise') {
    return Number.isFinite(totalSupplyNum) ? formatArithmeticResultForInput(floorPriceNum * totalSupplyNum) : ''
  }
  if (denomination === 'fdv' && inputCurrency === 'usd') {
    return usdPriceNum !== null && Number.isFinite(totalSupplyNum)
      ? formatArithmeticResultForInput(floorPriceNum * totalSupplyNum * usdPriceNum)
      : ''
  }
  return ''
}

export function FloorPriceSelector({
  chainId,
  floorPrice,
  raiseCurrency,
  tokenTotalSupply,
  onFloorPriceChange,
}: {
  chainId: UniverseChainId
  floorPrice: string
  raiseCurrency: RaiseCurrency
  tokenTotalSupply: CurrencyAmount<Currency>
  onFloorPriceChange: (value: string) => void
}) {
  const { t } = useTranslation()

  const [isFocused, setIsFocused] = useState(false)
  const [denomination, setDenomination] = useState<Denomination>('floorPrice')
  const [inputCurrency, setInputCurrency] = useState<InputCurrency>('raise')
  // Local value (dot-normalized) used in all modes except floorPrice+raise,
  // where the parent's `floorPrice` prop is the direct source of truth.
  const [localValue, setLocalValue] = useState('')
  const prevRaiseCurrencyRef = useRef(raiseCurrency)

  const { convertFiatAmountFormatted, formatNumberOrString } = useLocalizationContext()
  const { code: fiatCurrencyCode } = useAppFiatCurrencyInfo()
  const locale = useCurrentLocale()

  const raiseCurrencyObj = useMemo(() => getRaiseCurrencyAsCurrency(raiseCurrency, chainId), [raiseCurrency, chainId])

  const { price: raiseCurrencyUsdPrice } = useUSDCPrice(raiseCurrencyObj)

  const decimalSeparator = useMemo(
    () =>
      Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((p) => p.type === 'decimal')?.value ?? '.',
    [locale],
  )

  const floorPriceNum = parseFloat(floorPrice)
  const totalSupplyNum = parseFloat(tokenTotalSupply.toExact())
  const hasValidFloorPrice = Number.isFinite(floorPriceNum) && floorPriceNum > 0

  const usdPriceNum = useMemo(() => {
    if (!raiseCurrencyUsdPrice) {
      return null
    }
    try {
      return Number(raiseCurrencyUsdPrice.toSignificant(18))
    } catch {
      return null
    }
  }, [raiseCurrencyUsdPrice])

  // FDV in raise currency, always derived from the canonical floorPrice prop.
  const fdvRaiseNum = hasValidFloorPrice && Number.isFinite(totalSupplyNum) ? floorPriceNum * totalSupplyNum : null

  // In floorPrice+raise mode the parent prop is the source of truth; all other modes use localValue.
  const isParentControlled = denomination === 'floorPrice' && inputCurrency === 'raise'
  const activeDisplayValue = isParentControlled
    ? floorPrice.replace('.', decimalSeparator)
    : localValue.replace('.', decimalSeparator)

  // Draft modes: canonical floor price is derived from localValue + mode when *user-controlled* inputs change.
  // Do not list `usdPriceNum` in deps: it comes from a live oracle; including it re-commits on every tick and
  // silently drifts the stored floor price in raise tokens while the user has not edited the field.
  // When this effect runs (localValue / denomination / inputCurrency / supply / raise token changes), we
  // intentionally use `usdPriceNum` from that render — equivalent to snapshotting at commit time.
  //
  // When raise currency changes, the store clears floor price; treat the draft as empty for this commit so we
  // never call `onFloorPriceChange` with a value derived from stale `localValue` + the new raise token.
  useEffect(() => {
    const raiseCurrencyChanged = prevRaiseCurrencyRef.current !== raiseCurrency
    prevRaiseCurrencyRef.current = raiseCurrency

    if (raiseCurrencyChanged) {
      setLocalValue('')
    }

    if (isParentControlled) {
      return
    }

    const draftForCommit = raiseCurrencyChanged ? '' : localValue
    const next = commitDraftToFloorPrice({
      localValue: draftForCommit,
      denomination,
      inputCurrency,
      usdPriceNum,
      tokenTotalSupply,
      raiseCurrency: raiseCurrencyObj,
    })
    if (next !== floorPrice) {
      onFloorPriceChange(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usdPriceNum omitted: see comment above
  }, [
    denomination,
    floorPrice,
    inputCurrency,
    isParentControlled,
    localValue,
    onFloorPriceChange,
    raiseCurrency,
    raiseCurrencyObj,
    tokenTotalSupply,
  ])

  // ─── Derived display strings ──────────────────────────────────────────────

  // Label next to the input: currency + optional "FDV" suffix.
  const inputLabel = useMemo(() => {
    const currencyStr = inputCurrency === 'usd' ? fiatCurrencyCode : raiseCurrency
    return denomination === 'fdv' ? `${currencyStr} ${t('stats.fdv')}` : currencyStr
  }, [inputCurrency, denomination, fiatCurrencyCode, raiseCurrency, t])

  // Pill: always shows the other denomination in raise currency.
  const pillText = useMemo(() => {
    if (denomination === 'floorPrice') {
      const display =
        fdvRaiseNum !== null
          ? formatNumberOrString({ value: fdvRaiseNum.toString(), type: NumberType.TokenNonTx })
          : '0'
      return `${display} ${raiseCurrency} ${t('stats.fdv')}`
    }
    const display = hasValidFloorPrice ? formatNumberOrString({ value: floorPrice, type: NumberType.TokenNonTx }) : '0'
    return `${display} ${raiseCurrency} ${t('toucan.createAuction.step.configureAuction.tokenPrice')}`
  }, [denomination, fdvRaiseNum, hasValidFloorPrice, floorPrice, raiseCurrency, formatNumberOrString, t])

  // Bottom row: shows the other currency representation.
  const bottomText = useMemo(() => {
    if (inputCurrency === 'usd') {
      // Show raise-currency equivalent.
      if (denomination === 'floorPrice') {
        const display = hasValidFloorPrice
          ? formatNumberOrString({ value: floorPrice, type: NumberType.TokenNonTx })
          : '0'
        return `${display} ${raiseCurrency}`
      }
      const display =
        fdvRaiseNum !== null
          ? formatNumberOrString({ value: fdvRaiseNum.toString(), type: NumberType.TokenNonTx })
          : '0'
      return `${display} ${raiseCurrency} ${t('stats.fdv')}`
    }
    // Show fiat equivalent.
    if (!hasValidFloorPrice || usdPriceNum === null) {
      return `${convertFiatAmountFormatted(0, NumberType.FiatTokenPrice)} ${fiatCurrencyCode}`
    }
    const raiseAmount = denomination === 'fdv' && fdvRaiseNum !== null ? fdvRaiseNum : floorPriceNum
    return `${convertFiatAmountFormatted(raiseAmount * usdPriceNum, NumberType.FiatTokenPrice)} ${fiatCurrencyCode}`
  }, [
    inputCurrency,
    denomination,
    hasValidFloorPrice,
    floorPrice,
    floorPriceNum,
    fdvRaiseNum,
    raiseCurrency,
    usdPriceNum,
    convertFiatAmountFormatted,
    fiatCurrencyCode,
    formatNumberOrString,
    t,
  ])

  // ─── Input handler ────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (value: string) => {
      const normalized = normalizeDecimalInput(value, decimalSeparator)
      if (normalized === null) {
        return
      }

      if (isParentControlled) {
        const maxDecimals = raiseCurrencyObj?.decimals
        if (maxDecimals !== undefined && exceedsDecimalCap(normalized, maxDecimals)) {
          return
        }
        onFloorPriceChange(normalized)
        return
      }

      const maxDecimals = maxDecimalsForDraftInput(inputCurrency, raiseCurrencyObj?.decimals)
      if (exceedsDecimalCap(normalized, maxDecimals)) {
        return
      }

      setLocalValue(normalized)
    },
    [decimalSeparator, inputCurrency, isParentControlled, onFloorPriceChange, raiseCurrencyObj?.decimals],
  )

  // ─── Toggle handlers ──────────────────────────────────────────────────────

  // Pill: toggle denomination, keeping inputCurrency unchanged.
  const toggleDenomination = useCallback(() => {
    const next: Denomination = denomination === 'floorPrice' ? 'fdv' : 'floorPrice'
    const displayValue = getDisplayValueForMode({
      denomination: next,
      inputCurrency,
      floorPriceNum,
      totalSupplyNum,
      usdPriceNum,
      hasValidFloorPrice,
    })
    setLocalValue(displayValue)
    setDenomination(next)
  }, [denomination, inputCurrency, hasValidFloorPrice, floorPriceNum, totalSupplyNum, usdPriceNum])

  // Bottom row: toggle inputCurrency, keeping denomination unchanged.
  const toggleInputCurrency = useCallback(() => {
    const next: InputCurrency = inputCurrency === 'raise' ? 'usd' : 'raise'
    const displayValue = getDisplayValueForMode({
      denomination,
      inputCurrency: next,
      floorPriceNum,
      totalSupplyNum,
      usdPriceNum,
      hasValidFloorPrice,
    })
    setLocalValue(displayValue)
    setInputCurrency(next)
  }, [inputCurrency, denomination, hasValidFloorPrice, floorPriceNum, totalSupplyNum, usdPriceNum])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
  }, [])

  const unfocusedDisplayText = activeDisplayValue.length > 0 ? activeDisplayValue : `0${decimalSeparator}00`

  return (
    <Flex
      backgroundColor="$surface2"
      borderWidth={1}
      borderColor="$surface3"
      borderRadius="$rounded16"
      p="$spacing16"
      position="relative"
    >
      <Flex row gap="$spacing8" alignItems="center" justifyContent="space-between">
        <Flex gap="$spacing4">
          <Text variant="body3" color="$neutral2">
            {t('toucan.createAuction.step.configureAuction.floorPrice')}
          </Text>
          <Flex row gap="$spacing4" alignItems="center" flex={1} minWidth={0}>
            {isFocused ? (
              <Input
                autoFocus
                height={fonts.heading3.lineHeight}
                $platform-web={{
                  fieldSizing: 'content',
                  minWidth: '1ch',
                  maxWidth: '100%',
                }}
                value={activeDisplayValue}
                onChangeText={handleChange}
                onBlur={handleBlur}
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
            ) : (
              <Text
                variant="heading3"
                color={activeDisplayValue.length > 0 ? '$neutral1' : '$neutral3'}
                cursor="text"
                onPress={handleFocus}
              >
                {unfocusedDisplayText}
              </Text>
            )}
            <Text variant="heading3" color="$neutral2" flexShrink={0}>
              {inputLabel}
            </Text>
          </Flex>
          <TouchableArea onPress={toggleInputCurrency}>
            <Text variant="subheading2" color="$neutral2">
              {bottomText}
            </Text>
          </TouchableArea>
        </Flex>
        <TouchableArea onPress={toggleDenomination} flexShrink={0} alignSelf="flex-start">
          <Flex backgroundColor="$surface3" borderRadius="$roundedFull" p="$spacing8">
            <Text variant="buttonLabel4" color="$neutral1">
              {pillText}
            </Text>
          </Flex>
        </TouchableArea>
      </Flex>
    </Flex>
  )
}

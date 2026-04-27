import { useCallback, useRef, useState, type ComponentRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Input, Text, Tooltip, TouchableArea } from 'ui/src'
import { fonts } from 'ui/src/theme'
import { zIndexes } from 'ui/src/theme/zIndexes'
import { PercentButton } from '~/pages/Liquidity/CreateAuction/components/PercentButton'

type InputRef = ComponentRef<typeof Input>

const MIN_PERCENT = 25
const MAX_PERCENT = 100
const QUICK_SELECT_PERCENTS = [25, 50, 75, 100] as const
const MAX_PERCENT_DECIMAL_PLACES = 5

function isValidPartialPercentInput(value: string): boolean {
  if (value === '') {
    return true
  }
  const dot = value.indexOf('.')
  if (dot === -1) {
    return /^\d+$/.test(value)
  }
  if (value.indexOf('.', dot + 1) !== -1) {
    return false
  }
  const intPart = value.slice(0, dot)
  const fracPart = value.slice(dot + 1)
  if (fracPart.length > MAX_PERCENT_DECIMAL_PLACES) {
    return false
  }
  if (intPart !== '' && !/^\d+$/.test(intPart)) {
    return false
  }
  if (!/^\d*$/.test(fracPart)) {
    return false
  }
  return intPart !== '' || fracPart !== '' || value === '.'
}

/** Stable string for display / focus seed (trims trailing zeros, max 5 decimal places). */
function formatPostAuctionPercentForUi(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) {
    return ''
  }
  const normalized = Math.round(percent * 10 ** MAX_PERCENT_DECIMAL_PLACES) / 10 ** MAX_PERCENT_DECIMAL_PLACES
  return normalized.toFixed(MAX_PERCENT_DECIMAL_PLACES).replace(/\.?0+$/, '')
}

interface PostAuctionLiquiditySelectorProps {
  postAuctionLiquidityPercent: number
  raiseCurrencySymbol: string
  subtitle: string
  showSubtitleTooltip: boolean
  onSelectPercent: (percent: number) => void
}

export function PostAuctionLiquiditySelector({
  postAuctionLiquidityPercent,
  raiseCurrencySymbol,
  subtitle,
  showSubtitleTooltip,
  onSelectPercent,
}: PostAuctionLiquiditySelectorProps) {
  const { t } = useTranslation()

  const inputRef = useRef<InputRef>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const [showMinTooltip, setShowMinTooltip] = useState(false)

  // Clamp caret so it never lands on or after the trailing `%` (web: underlying `<input>`)
  const clampCaret = useCallback(() => {
    const el = inputRef.current as unknown as HTMLInputElement | null
    if (!el) {
      return
    }
    const max = el.value.length - 1 // before the `%`
    if ((el.selectionStart ?? 0) > max || (el.selectionEnd ?? 0) > max) {
      el.setSelectionRange(Math.min(el.selectionStart ?? max, max), Math.min(el.selectionEnd ?? max, max))
    }
  }, [])

  const parsedInput = isFocused ? Number(rawInput) : null
  const isInvalid =
    parsedInput !== null &&
    rawInput !== '' &&
    Number.isFinite(parsedInput) &&
    (parsedInput < MIN_PERCENT || parsedInput > MAX_PERCENT)

  const handleChange = useCallback(
    (value: string) => {
      if (!isValidPartialPercentInput(value)) {
        return
      }
      setRawInput(value)

      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return
      }

      // Show tooltip when typing a value below minimum
      setShowMinTooltip(parsed < MIN_PERCENT)

      // Live-update percent (clamped to valid range for the store)
      onSelectPercent(Math.min(Math.max(parsed, MIN_PERCENT), MAX_PERCENT))
    },
    [onSelectPercent],
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setShowMinTooltip(false)
    setRawInput(formatPostAuctionPercentForUi(postAuctionLiquidityPercent))
  }, [postAuctionLiquidityPercent])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    setShowMinTooltip(false)

    const parsed = Number(rawInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }

    // Snap to closest valid value on blur
    onSelectPercent(Math.min(Math.max(parsed, MIN_PERCENT), MAX_PERCENT))
  }, [rawInput, onSelectPercent])

  const handleSelectPercent = useCallback(
    (percent: number) => {
      setIsFocused(false)
      setRawInput('')
      setShowMinTooltip(false)
      onSelectPercent(percent)
    },
    [onSelectPercent],
  )

  const isMinActive = postAuctionLiquidityPercent === MIN_PERCENT

  return (
    <Flex
      backgroundColor="$surface2"
      borderWidth="$spacing1"
      borderColor="$surface3"
      borderRadius="$rounded16"
      p="$spacing16"
      gap="$spacing8"
    >
      {/* Header: label + help icon */}
      <Flex row alignItems="center" gap="$spacing4">
        <Text variant="buttonLabel3" color="$neutral2">
          {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.label', {
            raiseCurrency: raiseCurrencySymbol,
          })}
        </Text>
      </Flex>

      {/* Input row: percent + subtitle on left, quick selects on right */}
      <Flex row alignItems="center">
        <Flex flex={1} flexBasis={0} minWidth={0} gap="$spacing4">
          {isFocused ? (
            <Input
              ref={inputRef}
              autoFocus
              height={fonts.heading3.lineHeight}
              value={`${rawInput}%`}
              onChangeText={(value: string) => handleChange(value.replace(/%/g, ''))}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onSelectionChange={clampCaret}
              placeholder="0%"
              placeholderTextColor="$neutral3"
              fontSize={fonts.heading3.fontSize}
              lineHeight={fonts.heading3.lineHeight}
              fontWeight={fonts.heading3.fontWeight}
              color={isInvalid ? '$statusCritical' : '$neutral1'}
              px="$none"
              backgroundColor="$transparent"
              width="100%"
            />
          ) : (
            <Text variant="heading3" color="$neutral1" cursor="text" onPress={handleFocus}>
              {`${formatPostAuctionPercentForUi(postAuctionLiquidityPercent) || '0'}%`}
            </Text>
          )}
          {showSubtitleTooltip ? (
            <Tooltip placement="left">
              <Tooltip.Trigger asChild>
                <Flex cursor="help" alignSelf="flex-start">
                  <Text variant="body4" color="$neutral2">
                    {subtitle}
                  </Text>
                </Flex>
              </Tooltip.Trigger>
              <Tooltip.Content zIndex={zIndexes.overlay}>
                <Tooltip.Arrow />
                <Text variant="body4" color="$neutral1" maxWidth={280}>
                  {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.subtitleFloorPriceTooltip')}
                </Text>
              </Tooltip.Content>
            </Tooltip>
          ) : (
            <Flex alignSelf="flex-start">
              <Text variant="body4" color="$neutral2">
                {subtitle}
              </Text>
            </Flex>
          )}
        </Flex>

        {/* Quick selects */}
        <Flex row flex={1} flexBasis={0} minWidth={0} gap="$spacing2">
          {/* 25% button with controlled tooltip */}
          <Tooltip placement="bottom" open={showMinTooltip}>
            <TouchableArea
              flex={1}
              minWidth={0}
              backgroundColor={isMinActive ? '$surface3' : 'transparent'}
              borderWidth="$spacing1"
              borderColor="$surface3"
              borderRadius="$rounded16"
              px="$spacing8"
              py="$spacing6"
              onPress={handleSelectPercent.bind(null, MIN_PERCENT)}
            >
              <Tooltip.Trigger asChild>
                <Flex flex={1} alignItems="center" justifyContent="center">
                  <Text variant="buttonLabel4" color="$neutral1">
                    {`${MIN_PERCENT}%`}
                  </Text>
                </Flex>
              </Tooltip.Trigger>
            </TouchableArea>
            <Tooltip.Content zIndex={zIndexes.overlay}>
              <Tooltip.Arrow />
              <Text variant="body4" color="$neutral1" maxWidth={250}>
                {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.minTooltip')}
              </Text>
            </Tooltip.Content>
          </Tooltip>

          {QUICK_SELECT_PERCENTS.filter((pct) => pct !== MIN_PERCENT).map((pct) => (
            <PercentButton
              key={pct}
              label={`${pct}%`}
              isActive={postAuctionLiquidityPercent === pct}
              onPress={handleSelectPercent.bind(null, pct)}
            />
          ))}
        </Flex>
      </Flex>
    </Flex>
  )
}

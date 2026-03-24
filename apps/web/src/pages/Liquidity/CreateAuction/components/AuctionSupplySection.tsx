import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea } from 'ui/src'
import { Settings } from 'ui/src/components/icons/Settings'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
import { SupplyCurvePopover } from '~/pages/Liquidity/CreateAuction/components/SupplyCurvePopover'
import { SupplyCurve } from '~/pages/Liquidity/CreateAuction/types'

const QUICK_SELECT_PERCENTS = [25, 50, 75] as const
const NUM_BARS = 100
// Static array created once at module load — prevents DOM creation/destruction on every drag event
const BARS = Array.from({ length: NUM_BARS }, (_, i) => i)

export function AuctionSupplySection({
  auctionSupplyPercent,
  maxAuctionSupplyAmount,
  tokenSymbol,
  supplyCurve,
  onSelectPercent,
  onSelectSupplyCurve,
}: {
  auctionSupplyPercent: number
  maxAuctionSupplyAmount?: string
  tokenSymbol: string
  supplyCurve: SupplyCurve
  onSelectPercent: (percent: number) => void
  onSelectSupplyCurve: (curve: SupplyCurve) => void
}) {
  const { t } = useTranslation()
  const { formatNumberOrString } = useLocalizationContext()
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const isDragging = useRef(false)
  const onSelectPercentRef = useRef(onSelectPercent)
  onSelectPercentRef.current = onSelectPercent

  const totalTokenAmountNum = maxAuctionSupplyAmount !== undefined ? parseFloat(maxAuctionSupplyAmount) : undefined
  const computedAmount =
    totalTokenAmountNum !== undefined ? (auctionSupplyPercent / 100) * totalTokenAmountNum : undefined

  const formatAmount = (amount: number): string =>
    formatNumberOrString({ value: amount.toString(), type: NumberType.TokenNonTx })

  const displayAmount = computedAmount !== undefined ? formatAmount(computedAmount) : '—'
  const displayTotal =
    maxAuctionSupplyAmount !== undefined
      ? formatNumberOrString({ value: maxAuctionSupplyAmount, type: NumberType.TokenNonTx })
      : '—'

  const getPercentFromClientX = useCallback((clientX: number, el: HTMLDivElement): number => {
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const raw = Math.round((x / rect.width) * 100)
    return Math.max(0, Math.min(100, raw))
  }, [])

  useEffect(() => {
    const el = sliderRef.current
    if (!el) {
      return undefined
    }

    const onPointerDown = (e: PointerEvent): void => {
      isDragging.current = true
      el.setPointerCapture(e.pointerId)
      onSelectPercentRef.current(getPercentFromClientX(e.clientX, el))
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (!isDragging.current) {
        return
      }
      onSelectPercentRef.current(getPercentFromClientX(e.clientX, el))
    }

    const onPointerUp = (): void => {
      isDragging.current = false
    }

    const onPointerCancel = (): void => {
      isDragging.current = false
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [getPercentFromClientX])

  return (
    <Flex gap="$spacing8">
      <Flex gap="$spacing4">
        <Text variant="subheading1" color="$neutral1">
          {t('toucan.createAuction.step.configureAuction.auctionSupply')}
        </Text>
        <Text variant="body3" color="$neutral2">
          {t('toucan.createAuction.step.configureAuction.auctionSupply.description')}
        </Text>
      </Flex>
      <Flex
        backgroundColor="$surface2"
        borderWidth="$spacing1"
        borderColor="$surface3"
        borderRadius="$rounded16"
        p="$spacing16"
        gap="$spacing4"
      >
        {/* Card header: "Amount" label */}
        <Flex row justifyContent="space-between" alignItems="center">
          <Text variant="body3" color="$neutral2">
            {t('toucan.createAuction.step.configureAuction.auctionSupply.amount')}
          </Text>
          <SupplyCurvePopover
            supplyCurve={supplyCurve}
            onSelect={onSelectSupplyCurve}
            trigger={
              <TouchableArea
                borderRadius="$roundedFull"
                backgroundColor="$surface3"
                p="$spacing2"
                alignItems="center"
                justifyContent="center"
              >
                <Settings size="$icon.16" color="$neutral2" />
              </TouchableArea>
            }
          />
        </Flex>
        <Flex gap="$spacing16">
          {/* Amount display */}
          <Flex row justifyContent="space-between" alignItems="flex-end">
            <Flex row gap="$spacing4" alignItems="baseline">
              <Text variant="heading3" color="$neutral1">
                {displayAmount}
              </Text>
              <Text variant="heading3" color="$neutral2">
                {tokenSymbol}
              </Text>
            </Flex>
            <Text variant="body4" color="$neutral2">
              {displayTotal} {t('toucan.createAuction.step.configureAuction.auctionSupply.available')}
            </Text>
          </Flex>

          {/* Segmented slider */}
          <Flex ref={sliderRef} height="$spacing24" position="relative" cursor="pointer" userSelect="none">
            {/* Full-width bar track — static array, so React never creates/destroys DOM nodes on drag */}
            <Flex
              position="absolute"
              left={0}
              right={0}
              top={0}
              height="$spacing24"
              row
              justifyContent="space-between"
              pointerEvents="none"
            >
              {BARS.map((i) => (
                <Flex
                  key={i}
                  width="$spacing4"
                  height="$spacing24"
                  borderRadius="$rounded8"
                  backgroundColor="$surface3"
                />
              ))}
            </Flex>

            {/* Solid fill */}
            {auctionSupplyPercent > 0 && (
              <Flex
                position="absolute"
                left={0}
                top={0}
                width={`${auctionSupplyPercent}%`}
                height="$spacing24"
                borderRadius="$rounded4"
                backgroundColor="$statusSuccess"
                pointerEvents="none"
              >
                {/* Thumb: 8×20, 2px inset from right and top */}
                <Flex
                  position="absolute"
                  width={auctionSupplyPercent === 1 ? '$spacing2' : '$spacing8'}
                  height="$spacing20"
                  top="$spacing2"
                  right="$spacing2"
                  borderRadius="$rounded4"
                  backgroundColor="$white"
                />
              </Flex>
            )}
          </Flex>

          {/* Quick selects */}
          <Flex row gap="$spacing8">
            {QUICK_SELECT_PERCENTS.map((pct) => {
              const isActive = auctionSupplyPercent === pct
              return (
                <TouchableArea
                  key={pct}
                  flex={1}
                  backgroundColor={isActive ? '$surface3' : '$surface1'}
                  borderWidth="$spacing1"
                  borderColor="$surface3"
                  borderRadius="$rounded16"
                  px="$spacing8"
                  py="$spacing6"
                  alignItems="center"
                  justifyContent="center"
                  onPress={onSelectPercent.bind(null, pct)}
                >
                  <Text variant="buttonLabel4" color="$neutral1">
                    {pct}%
                  </Text>
                </TouchableArea>
              )
            })}
            <TouchableArea
              flex={1}
              backgroundColor={auctionSupplyPercent === 100 ? '$surface3' : '$surface1'}
              borderWidth="$spacing1"
              borderColor="$surface3"
              borderRadius="$rounded16"
              px="$spacing8"
              py="$spacing6"
              alignItems="center"
              justifyContent="center"
              onPress={onSelectPercent.bind(null, 100)}
            >
              <Text variant="buttonLabel4" color="$neutral1">
                {t('common.max')}
              </Text>
            </TouchableArea>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  )
}

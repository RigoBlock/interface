import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Flex, Input, Popover, ScrollView, SegmentedControl, Text, TouchableArea, styled } from 'ui/src'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { zIndexes } from 'ui/src/theme'
import { HL_MIN_ORDER_USD } from 'uniswap/src/features/chains/evm/info/hyperevm'
import { HlPerpAsset } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'
import { onNumericInput, PositionSide } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'

const DROPDOWN_MAX_HEIGHT = 240

const DropdownTrigger = styled(Flex, {
  position: 'relative',
  height: 44,
  borderRadius: '$rounded12',
  backgroundColor: '$surface2',
  borderColor: '$surface3',
  borderWidth: 1,
  alignItems: 'center',
  justifyContent: 'space-between',
  flexDirection: 'row',
  paddingHorizontal: '$spacing12',
  paddingRight: 28,
  gap: '$spacing8',
  cursor: 'pointer',
})

const DropdownTriggerText = styled(Text, {
  color: '$neutral1',
  flexShrink: 0,
})

const DropdownIcon = styled(Flex, {
  position: 'absolute',
  right: '$spacing12',
  pointerEvents: 'none',
})

const DropdownContent = styled(Popover.Content, {
  backgroundColor: '$surface1',
  borderRadius: '$rounded16',
  borderWidth: 1,
  borderColor: '$surface3',
  padding: '$spacing8',
  width: '100%',
  maxWidth: 360,
  minWidth: 240,
  elevate: true,
})

const DropdownItem = styled(TouchableArea, {
  paddingHorizontal: '$spacing12',
  paddingVertical: '$spacing10',
  borderRadius: '$rounded12',
  hoverStyle: {
    backgroundColor: '$surface2',
  },
})

export type HyperliquidOpenInputError = 'market' | 'size' | 'min-size' | 'price' | undefined

interface HyperliquidOpenPositionFormProps {
  universe: HlPerpAsset[]
  selectedCoin: string
  setSelectedCoin: (coin: string) => void
  side: PositionSide
  setSide: (side: PositionSide) => void
  sizeUsd: string
  setSizeUsd: (value: string) => void
  markPrice: number | undefined
  perpsAccountValueUsd: number
  isLoadingPrices: boolean
  errorReason: string | undefined
  inputError: HyperliquidOpenInputError
  canSubmit: boolean
  onSubmit: () => void
  onDismiss: () => void
}

function getInputErrorLabel(inputError: HyperliquidOpenInputError, t: TFunction): string {
  switch (inputError) {
    case 'market':
      return t('perps.errors.enterMarket')
    case 'size':
      return t('perps.errors.enterSize')
    case 'min-size':
      return t('perps.hyperliquid.errors.minSize', { usd: HL_MIN_ORDER_USD })
    case 'price':
      return t('perps.errors.marketDataUnavailable')
    default:
      return t('perps.open.confirm')
  }
}

export function HyperliquidOpenPositionForm({
  universe,
  selectedCoin,
  setSelectedCoin,
  side,
  setSide,
  sizeUsd,
  setSizeUsd,
  markPrice,
  perpsAccountValueUsd,
  isLoadingPrices,
  errorReason,
  inputError,
  canSubmit,
  onSubmit,
  onDismiss,
}: HyperliquidOpenPositionFormProps): JSX.Element {
  const { t } = useTranslation()
  const [marketOpen, setMarketOpen] = useState(false)
  const [marketSearchQuery, setMarketSearchQuery] = useState('')

  const filteredUniverse = useMemo(() => {
    const query = marketSearchQuery.trim().toUpperCase()
    if (!query) {
      return universe
    }
    return universe.filter((asset) => asset.name.toUpperCase().includes(query))
  }, [universe, marketSearchQuery])

  const selectedAsset = universe.find((asset) => asset.name === selectedCoin)
  const effectiveLeverage = perpsAccountValueUsd > 0 && Number(sizeUsd) > 0 ? Number(sizeUsd) / perpsAccountValueUsd : 0

  function onMarketChange(coin: string) {
    setSelectedCoin(coin)
    setMarketSearchQuery('')
    setMarketOpen(false)
  }

  return (
    <Flex gap="$spacing16" padding="$spacing24">
      <Flex row justifyContent="space-between" alignItems="center">
        <Text variant="subheading1">{t('perps.hyperliquid.open.title')}</Text>
        <Text cursor="pointer" onPress={onDismiss} color="$neutral2">
          ✕
        </Text>
      </Flex>

      <Flex gap="$spacing4">
        <Text variant="body3" color="$neutral2">
          {t('perps.open.market')}
        </Text>
        <Popover open={marketOpen} onOpenChange={setMarketOpen} placement="bottom-start">
          <Popover.Trigger>
            <DropdownTrigger>
              <DropdownTriggerText>{selectedCoin || t('perps.open.selectMarket')}</DropdownTriggerText>
              <DropdownIcon>
                <RotatableChevron direction={marketOpen ? 'up' : 'down'} />
              </DropdownIcon>
            </DropdownTrigger>
          </Popover.Trigger>
          <DropdownContent zIndex={zIndexes.overlay}>
            <Flex gap="$spacing8">
              <Input
                value={marketSearchQuery}
                onChangeText={setMarketSearchQuery}
                placeholder={t('perps.open.searchMarket')}
                height={40}
                backgroundColor="$surface2"
                borderColor="$surface3"
              />
              <ScrollView maxHeight={DROPDOWN_MAX_HEIGHT} width="100%">
                <Flex gap="$spacing2">
                  {filteredUniverse.map((asset) => (
                    <DropdownItem
                      key={asset.name}
                      onPress={() => onMarketChange(asset.name)}
                      backgroundColor={asset.name === selectedCoin ? '$surface2' : undefined}
                    >
                      <Text variant="body3" color="$neutral1">
                        {asset.name}
                      </Text>
                    </DropdownItem>
                  ))}
                </Flex>
              </ScrollView>
            </Flex>
          </DropdownContent>
        </Popover>
      </Flex>

      <Flex gap="$spacing4">
        <Text variant="body3" color="$neutral2">
          {t('perps.open.side')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'long' as PositionSide, display: <Trans i18nKey="perps.side.long" /> },
            { value: 'short' as PositionSide, display: <Trans i18nKey="perps.side.short" /> },
          ]}
          selectedOption={side}
          onSelectOption={setSide}
          fullWidth
        />
      </Flex>

      <Flex gap="$spacing4">
        <Text variant="body3" color="$neutral2">
          {t('perps.open.size')}
        </Text>
        <Input
          value={sizeUsd}
          onChangeText={(value) => onNumericInput(value, setSizeUsd)}
          placeholder="0.0"
          inputMode="decimal"
          height={44}
          backgroundColor="$surface2"
          borderColor="$surface3"
        />
      </Flex>

      <Flex gap="$spacing12" padding="$spacing16" borderRadius="$rounded12" backgroundColor="$surface2">
        <Text variant="body3" fontWeight="600">
          {t('perps.open.summary')}
        </Text>
        <Flex row justifyContent="space-between">
          <Text variant="body3" color="$neutral2">
            {t('perps.open.currentPrice')}
          </Text>
          <Text variant="body3">
            {markPrice && markPrice > 0
              ? markPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
              : isLoadingPrices
                ? t('perps.modal.loading')
                : '—'}
          </Text>
        </Flex>
        <Flex row justifyContent="space-between">
          <Text variant="body3" color="$neutral2">
            {t('perps.hyperliquid.open.maxLeverage')}
          </Text>
          <Text variant="body3">{selectedAsset ? `${selectedAsset.maxLeverage}x` : '—'}</Text>
        </Flex>
        <Flex row justifyContent="space-between">
          <Text variant="body3" color="$neutral2">
            {t('perps.hyperliquid.open.effectiveLeverage')}
          </Text>
          <Text variant="body3">{effectiveLeverage > 0 ? `${effectiveLeverage.toFixed(2)}x` : '—'}</Text>
        </Flex>
      </Flex>

      {errorReason && (
        <Text variant="body3" color="$statusCritical">
          {errorReason}
        </Text>
      )}

      <Button variant="branded" size="medium" isDisabled={!canSubmit} onPress={onSubmit}>
        {getInputErrorLabel(inputError, t)}
      </Button>
    </Flex>
  )
}

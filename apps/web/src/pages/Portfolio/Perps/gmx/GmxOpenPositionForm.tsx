import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, Popover, ScrollView, SegmentedControl, Text, TouchableArea, styled } from 'ui/src'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { zIndexes } from 'ui/src/theme'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import {
  formatGmxAnnualizedRate,
  GmxTokenInfo,
} from '~/pages/Portfolio/Perps/gmx/useGmxOpenPositionMarketData'
import {
  formatUsdPrice,
  InputError,
  onNumericInput,
  PositionSide,
} from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'

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

interface GmxOpenPositionFormProps {
  marketIndexNames: string[]
  selectedMarketIndexName: string
  setSelectedMarketIndexName: (value: string) => void
  collateralOptions: string[]
  isLong: PositionSide
  setIsLong: (value: PositionSide) => void
  selectedCollateralToken: string
  setSelectedCollateralToken: (value: string) => void
  sizeUsd: string
  setSizeUsd: (value: string) => void
  margin: string
  setMargin: (value: string) => void
  tokensByAddress: Map<string, GmxTokenInfo>
  humanPrice: number | undefined
  isLoading: boolean
  fundingRate: string | undefined
  borrowingRate: string | undefined
  existingPosition: GmxPosition | undefined
  collateralTokenInfo: GmxTokenInfo | undefined
  errorReason: string | undefined
  inputError: InputError
  canSubmit: boolean
  onSubmit: () => void
  onDismiss: () => void
}

function getSubmitButtonLabel({
  inputError,
  existingPosition,
  t,
}: {
  inputError: InputError
  existingPosition: GmxPosition | undefined
  t: (key: string) => string
}): string {
  switch (inputError) {
    case 'market':
      return t('perps.errors.enterMarket')
    case 'collateral':
      return t('perps.errors.enterCollateral')
    case 'size':
      return t('perps.errors.enterSize')
    case 'margin':
      return t('perps.errors.enterMargin')
    case 'data':
      return t('perps.errors.marketDataUnavailable')
    default:
      return existingPosition ? t('perps.open.increaseExisting') : t('perps.open.confirm')
  }
}

export function GmxOpenPositionForm(props: GmxOpenPositionFormProps): JSX.Element {
  const { t } = useTranslation()
  const {
    marketIndexNames,
    selectedMarketIndexName,
    setSelectedMarketIndexName,
    collateralOptions,
    isLong,
    setIsLong,
    selectedCollateralToken,
    setSelectedCollateralToken,
    sizeUsd,
    setSizeUsd,
    margin,
    setMargin,
    tokensByAddress,
    humanPrice,
    isLoading,
    fundingRate,
    borrowingRate,
    existingPosition,
    collateralTokenInfo,
    errorReason,
    inputError,
    canSubmit,
    onSubmit,
    onDismiss,
  } = props

  const [marketOpen, setMarketOpen] = useState(false)
  const [marketSearchQuery, setMarketSearchQuery] = useState('')

  const [collateralOpen, setCollateralOpen] = useState(false)

  const filteredMarketIndexNames = useMemo(() => {
    const query = marketSearchQuery.trim().toLowerCase()
    if (!query) {
      return marketIndexNames
    }
    return marketIndexNames.filter((name) => name.toLowerCase().includes(query))
  }, [marketIndexNames, marketSearchQuery])

  function onMarketChange(value: string) {
    setSelectedMarketIndexName(value)
    setMarketSearchQuery('')
    setMarketOpen(false)
  }

  function onCollateralChange(value: string) {
    setSelectedCollateralToken(value)
    setCollateralOpen(false)
  }

  const selectedMarketLabel = selectedMarketIndexName || t('perps.open.selectMarket')

  const selectedCollateralSymbol = selectedCollateralToken
    ? (tokensByAddress.get(normalizeTokenAddressForCache(selectedCollateralToken))?.symbol ??
        selectedCollateralToken)
    : t('perps.open.selectCollateral')

  const submitButtonLabel = getSubmitButtonLabel({ inputError, existingPosition, t })

  return (
    <Flex gap="$spacing16" padding="$spacing24">
      <Flex row justifyContent="space-between" alignItems="center">
        <Text variant="subheading1">{t('perps.open.title')}</Text>
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
              <DropdownTriggerText>{selectedMarketLabel}</DropdownTriggerText>
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
                  {filteredMarketIndexNames.map((name) => (
                    <DropdownItem
                      key={name}
                      onPress={() => onMarketChange(name)}
                      backgroundColor={name === selectedMarketIndexName ? '$surface2' : undefined}
                    >
                      <Text variant="body3" color="$neutral1">
                        {name}
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
            { value: 'long', display: <Trans i18nKey="perps.side.long" /> },
            { value: 'short', display: <Trans i18nKey="perps.side.short" /> },
          ]}
          selectedOption={isLong}
          onSelectOption={setIsLong}
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

      <Flex row gap="$spacing12">
        <Flex gap="$spacing4" flex={1}>
          <Text variant="body3" color="$neutral2">
            {t('perps.open.collateral')}
          </Text>
          <Popover open={collateralOpen} onOpenChange={setCollateralOpen} placement="bottom-start">
            <Popover.Trigger>
              <DropdownTrigger>
                <DropdownTriggerText>{selectedCollateralSymbol}</DropdownTriggerText>
                <DropdownIcon>
                  <RotatableChevron direction={collateralOpen ? 'up' : 'down'} />
                </DropdownIcon>
              </DropdownTrigger>
            </Popover.Trigger>
            <DropdownContent zIndex={zIndexes.overlay}>
              <ScrollView maxHeight={DROPDOWN_MAX_HEIGHT} width="100%">
                <Flex gap="$spacing2">
                  {collateralOptions.map((address) => {
                    const token = tokensByAddress.get(normalizeTokenAddressForCache(address))
                    const symbol = token?.symbol ?? address
                    return (
                      <DropdownItem
                        key={address}
                        onPress={() => onCollateralChange(address)}
                        backgroundColor={address === selectedCollateralToken ? '$surface2' : undefined}
                      >
                        <Text variant="body3" color="$neutral1">
                          {symbol}
                        </Text>
                      </DropdownItem>
                    )
                  })}
                </Flex>
              </ScrollView>
            </DropdownContent>
          </Popover>
        </Flex>

        <Flex gap="$spacing4" flex={1}>
          <Text variant="body3" color="$neutral2">
            {t('perps.open.margin')}
            {collateralTokenInfo ? ` (${collateralTokenInfo.symbol})` : ''}
          </Text>
          <Input
            value={margin}
            onChangeText={(value) => onNumericInput(value, setMargin)}
            placeholder="0.0"
            inputMode="decimal"
            disabled={!selectedCollateralToken}
            height={44}
            backgroundColor="$surface2"
            borderColor="$surface3"
          />
        </Flex>
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
            {humanPrice ? formatUsdPrice(humanPrice) : isLoading ? t('perps.modal.loading') : '—'}
          </Text>
        </Flex>
        <Flex row gap="$spacing12" justifyContent="space-between">
          <Flex row flex={1} justifyContent="space-between" gap="$spacing4">
            <Text variant="body3" color="$neutral2">
              {t('perps.open.funding')}
            </Text>
            <Text variant="body3">{formatGmxAnnualizedRate(fundingRate)}</Text>
          </Flex>
          <Flex row flex={1} justifyContent="space-between" gap="$spacing4">
            <Text variant="body3" color="$neutral2">
              {t('perps.open.borrow')}
            </Text>
            <Text variant="body3">{formatGmxAnnualizedRate(borrowingRate)}</Text>
          </Flex>
        </Flex>
        {existingPosition && (
          <Text variant="body3" color="$statusWarning">
            {t('perps.open.positionExists', { indexName: existingPosition.indexName })}
          </Text>
        )}
      </Flex>

      {errorReason && (
        <Text variant="body3" color="$statusCritical">
          {errorReason}
        </Text>
      )}

      <Button variant="branded" size="medium" isDisabled={!canSubmit} onPress={onSubmit}>
        {submitButtonLabel}
      </Button>
    </Flex>
  )
}

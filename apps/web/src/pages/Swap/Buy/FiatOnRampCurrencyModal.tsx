import { Flex, iconSizes, ModalCloseIcon, Text } from '@universe/mycelium'
import { GraduationCap } from '@universe/mycelium/icons/GraduationCap'
import { useIsDarkMode, useMedia, useScrollbarStyles } from '@universe/mycelium/theme-hooks-compat'
import { CSSProperties, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AutoSizer from 'react-virtualized-auto-sizer'
import { VariableSizeList as List } from 'react-window'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { SNAP_POINTS } from 'uniswap/src/components/TokenSelector/TokenSelector'
import { FiatOnRampCurrency } from 'uniswap/src/features/fiatOnRamp/types'
import { useIsWebFORNudgeEnabled } from 'uniswap/src/features/providers/webForNudgeProvider'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { CurrencyRow } from '~/components/SearchModal/CurrencyList'
import { DropdownController } from '~/features/Swap/DropdownController'
import { useBuyFormContext } from '~/pages/Swap/Buy/BuyFormContext'
import { HeaderContent } from '~/pages/Swap/Buy/CountryListModal'
import { ContentWrapper } from '~/pages/Swap/Buy/shared'

const ROW_ITEM_SIZE = 56

function FiatOnRampInfo() {
  const { t } = useTranslation()
  const isDarkMode = useIsDarkMode()

  return (
    <Flex
      row
      justifyContent="space-between"
      mx="$spacing16"
      p="$spacing12"
      gap="$spacing12"
      backgroundColor={isDarkMode ? '$cyanDark' : '$cyanLight'}
      borderRadius="$rounded12"
    >
      <Flex>
        <GraduationCap size={iconSizes.icon20} color="$cyanBase" />
      </Flex>
      <Flex gap="$spacing2" flexShrink={1}>
        <Text variant="body3" color="$neutral1">
          {t('fiatOnRamp.buy.info.title')}
        </Text>
        <Text variant="body3" color="$neutral2">
          {t('fiatOnRamp.buy.info.description')}
        </Text>
      </Flex>
    </Flex>
  )
}

interface FiatOnRampCurrencyModalProps {
  isOpen: boolean
  onDismiss: () => void
  onSelectCurrency: (currency: FiatOnRampCurrency) => void
  selectedCurrency?: FiatOnRampCurrency
  currencies: FiatOnRampCurrency[]
  unsupportedCurrencies: FiatOnRampCurrency[]
}

export function FiatOnRampCurrencyModal({
  isOpen,
  onDismiss,
  currencies,
  unsupportedCurrencies,
  selectedCurrency,
  onSelectCurrency,
}: FiatOnRampCurrencyModalProps) {
  const { t } = useTranslation()
  const media = useMedia()
  const scrollbarStyles = useScrollbarStyles()
  const { setBuyFormState } = useBuyFormContext()
  const isWebFORNudgeEnabled = useIsWebFORNudgeEnabled()

  const [expanded, setExpanded] = useState(true)
  const getItemSize = useCallback(
    (index: number) => {
      if (isWebFORNudgeEnabled && index === 0) {
        return 88
      }

      if (index === currencies.length) {
        return 40
      }

      return ROW_ITEM_SIZE
    },
    [currencies.length, isWebFORNudgeEnabled],
  )

  const [items, separatorIndex] = useMemo(() => {
    let _separatorIndex = -1
    let _items: (FiatOnRampCurrency | null)[] = [...currencies]
    if (isWebFORNudgeEnabled) {
      _items.unshift(null)
    }
    if (unsupportedCurrencies.length > 0) {
      _separatorIndex = currencies.length
      _items = _items.concat(null)
    }
    if (expanded) {
      _items = _items.concat(unsupportedCurrencies)
    }
    return [_items, _separatorIndex]
  }, [currencies, expanded, unsupportedCurrencies, isWebFORNudgeEnabled])

  return (
    <Modal
      name={ModalName.FiatOnRampTokenSelector}
      maxWidth={420}
      height={media.sm ? '100vh' : '100%'}
      maxHeight={700}
      // The mobile-web sheet must take its height from the snap point, not content-fit: the
      // virtualized currency list sizes itself to its container (AutoSizer) so it has no intrinsic
      // height, and a fit-mode sheet freezes at chrome height with an empty list. See (SWAP-3250)
      snapPoints={SNAP_POINTS}
      snapPointsMode="percent"
      isModalOpen={isOpen}
      onClose={onDismiss}
      padding={0}
    >
      <ContentWrapper>
        <HeaderContent>
          <Flex row justifyContent="space-between">
            <Text variant="subheading1">{t('common.selectToken.label')}</Text>
            <ModalCloseIcon testId="FiatOnRampCurrencyModal-close" onClose={onDismiss} />
          </Flex>
        </HeaderContent>
        <Flex grow>
          <AutoSizer disableWidth>
            {({ height }: { height: number }) => (
              <Flex data-testid="for-currency-list-wrapper">
                <List
                  height={height}
                  width="100%"
                  itemData={items}
                  itemCount={items.length}
                  itemSize={getItemSize}
                  itemKey={(index: number, data: typeof items) => data[index]?.meldCurrencyCode ?? index}
                  style={scrollbarStyles}
                >
                  {({
                    style,
                    data,
                    index,
                  }: {
                    data: (FiatOnRampCurrency | null)[]
                    index: number
                    style: CSSProperties
                  }) => {
                    if (isWebFORNudgeEnabled && index === 0) {
                      return <FiatOnRampInfo />
                    }

                    if (index === separatorIndex) {
                      return (
                        <Flex style={{ ...style }}>
                          <DropdownController
                            open={expanded}
                            onClick={() => {
                              // oxlint-disable-next-line no-shadow
                              setExpanded((expanded) => !expanded)
                            }}
                          >
                            {t('fiatOffRamp.unsupportedToken.divider')}
                          </DropdownController>
                        </Flex>
                      )
                    }

                    const currencyInfo = data[index]?.currencyInfo
                    if (!currencyInfo) {
                      return null
                    }

                    return (
                      <CurrencyRow
                        style={style}
                        currencyInfo={currencyInfo}
                        showUsdValue
                        showCurrencyAmount
                        onSelect={() => {
                          const currency = data[index]
                          if (!currency) {
                            return
                          }

                          if (currencies.includes(currency)) {
                            onSelectCurrency(currency)
                            onDismiss()
                          } else {
                            setBuyFormState((state) => ({ ...state, selectedUnsupportedCurrency: currency }))
                          }
                        }}
                        isSelected={selectedCurrency?.meldCurrencyCode === data[index]?.meldCurrencyCode}
                        eventProperties={{}}
                        otherSelected={false}
                      />
                    )
                  }}
                </List>
              </Flex>
            )}
          </AutoSizer>
        </Flex>
      </ContentWrapper>
    </Modal>
  )
}

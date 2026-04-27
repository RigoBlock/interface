import { type Currency, CurrencyAmount, Price } from '@uniswap/sdk-core'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea } from 'ui/src'
import { QuestionInCircleFilled } from 'ui/src/components/icons/QuestionInCircleFilled'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { NumberType } from 'utilities/src/format/types'
import { PostAuctionLiquiditySelector } from '~/pages/Liquidity/CreateAuction/components/PostAuctionLiquiditySelector'
import { type RaiseCurrency } from '~/pages/Liquidity/CreateAuction/types'
import { getRaiseCurrencyAsCurrency } from '~/pages/Liquidity/CreateAuction/utils'

interface PostAuctionLiquiditySectionProps {
  postAuctionLiquidityPercent: number
  auctionSupplyAmount: CurrencyAmount<Currency>
  postAuctionLiquidityAmount: CurrencyAmount<Currency>
  floorPrice: string
  raiseCurrency: RaiseCurrency
  chainId: UniverseChainId
  tokenSymbol: string
  onSelectPercent: (percent: number) => void
}

export function PostAuctionLiquiditySection({
  postAuctionLiquidityPercent,
  auctionSupplyAmount,
  postAuctionLiquidityAmount,
  floorPrice,
  raiseCurrency,
  chainId,
  tokenSymbol,
  onSelectPercent,
}: PostAuctionLiquiditySectionProps) {
  const { t } = useTranslation()
  const { formatNumberOrString } = useLocalizationContext()
  const [helpExpanded, setHelpExpanded] = useState(false)

  const toggleHelp = useCallback(() => setHelpExpanded((prev) => !prev), [])

  const { subtitle, showSubtitleTooltip } = useMemo(() => {
    const zeroSubtitle = t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.subtitle', {
      amount: '0',
      raiseCurrency,
    })
    const zero = { subtitle: zeroSubtitle, showSubtitleTooltip: false as const }

    const raiseSdk = getRaiseCurrencyAsCurrency(raiseCurrency, chainId)
    const trimmedFloor = floorPrice.trim()
    if (!raiseSdk || !trimmedFloor || auctionSupplyAmount.equalTo(0)) {
      return zero
    }

    const quotePerToken = getCurrencyAmount({
      value: trimmedFloor,
      valueType: ValueType.Exact,
      currency: raiseSdk,
    })
    if (!quotePerToken || quotePerToken.equalTo(0) || postAuctionLiquidityAmount.equalTo(0)) {
      return zero
    }

    const auctionToken = auctionSupplyAmount.currency
    const oneTokenRaw = 10n ** BigInt(auctionToken.decimals)
    const oneAuctionToken = CurrencyAmount.fromRawAmount(auctionToken, oneTokenRaw.toString())

    let floorPriceAsPrice: Price<Currency, Currency>
    try {
      floorPriceAsPrice = new Price({ baseAmount: oneAuctionToken, quoteAmount: quotePerToken })
    } catch {
      return zero
    }

    const notional = floorPriceAsPrice.quote(postAuctionLiquidityAmount)
    const formatted = formatNumberOrString({
      value: notional.toExact(),
      type: NumberType.TokenQuantityStats,
      placeholder: '0',
    })
    return {
      subtitle: t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.subtitle', {
        amount: formatted,
        raiseCurrency,
      }),
      showSubtitleTooltip: true as const,
    }
  }, [floorPrice, auctionSupplyAmount, postAuctionLiquidityAmount, raiseCurrency, chainId, formatNumberOrString, t])

  return (
    <Flex gap="$spacing8">
      <Flex gap="$spacing4" py="$spacing2">
        <Text variant="subheading1" color="$neutral1">
          {t('toucan.details.postAuctionLiquidity')}
        </Text>
        <Text variant="body3" color="$neutral2">
          {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.description', {
            raiseCurrency,
            tokenSymbol,
          })}
        </Text>
      </Flex>

      <PostAuctionLiquiditySelector
        postAuctionLiquidityPercent={postAuctionLiquidityPercent}
        raiseCurrencySymbol={raiseCurrency}
        subtitle={subtitle}
        showSubtitleTooltip={showSubtitleTooltip}
        onSelectPercent={onSelectPercent}
      />

      <Flex gap="$spacing4">
        <TouchableArea onPress={toggleHelp}>
          <Flex row gap="$spacing4" alignItems="center">
            <QuestionInCircleFilled size="$icon.16" color="$neutral2" />
            <Text
              variant="body3"
              color={helpExpanded ? '$neutral1' : '$neutral2'}
              textDecorationLine="underline"
              textDecorationStyle="dashed"
            >
              {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.helpLink')}
            </Text>
          </Flex>
        </TouchableArea>
        {helpExpanded && (
          <Flex pl="$spacing20">
            <Text variant="body4" color="$neutral2">
              {t('toucan.createAuction.step.configureAuction.postAuctionLiquidity.helpDescription', {
                raiseCurrency,
                tokenSymbol,
              })}
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  )
}

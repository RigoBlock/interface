import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { useActiveAddress } from '~/features/accounts/store/hooks'
import { useTotalSupply } from '~/hooks/useTotalSupply'
import useCurrencyBalance from '~/lib/hooks/useCurrencyBalance'
import {
  useCreateAuctionStore,
  useCreateAuctionStoreActions,
} from '~/pages/Liquidity/CreateAuction/CreateAuctionContext'
import { AdvancedSettingsRow } from '~/pages/Liquidity/CreateAuction/components/AdvancedSettingsRow'
import { AuctionSupplySection } from '~/pages/Liquidity/CreateAuction/components/AuctionSupplySection'
import { DurationSection } from '~/pages/Liquidity/CreateAuction/components/DurationSection'
import { FloorPriceSection } from '~/pages/Liquidity/CreateAuction/components/FloorPriceSection'
import { HookTile } from '~/pages/Liquidity/CreateAuction/components/HookTile'
import { RaiseCurrencySection } from '~/pages/Liquidity/CreateAuction/components/RaiseCurrencySection'
import { TokenSummaryCard } from '~/pages/Liquidity/CreateAuction/components/TokenSummaryCard'
import {
  AuctionType,
  type ConfigureAuctionFormState,
  NEW_TOKEN_TOTAL_SUPPLY,
  TokenMode,
} from '~/pages/Liquidity/CreateAuction/types'

export function ConfigureAuctionStep() {
  const { t } = useTranslation()
  const configureAuction: ConfigureAuctionFormState = useCreateAuctionStore((state) => state.configureAuction)
  const tokenForm = useCreateAuctionStore((state) => state.tokenForm)

  const {
    goToPreviousStep,
    goToNextStep,
    setAuctionType,
    setMaxDurationDays,
    setAuctionSupplyPercent,
    setSupplyCurve,
    setRaiseCurrency,
    setFloorPrice,
    updateConfigureAuctionField,
  } = useCreateAuctionStoreActions()

  const { auctionType, startTime, maxDurationDays, auctionSupplyPercent, supplyCurve, raiseCurrency, floorPrice } =
    configureAuction

  const isCreateNew = tokenForm.mode === TokenMode.CREATE_NEW
  const existingTokenCurrency = tokenForm.existing.existingTokenCurrencyInfo?.currency
  const chainId = isCreateNew
    ? tokenForm.createNew.network
    : (existingTokenCurrency?.chainId ?? UniverseChainId.Mainnet)
  const walletAddress = useActiveAddress(Platform.EVM)
  const existingTokenBalance = useCurrencyBalance(walletAddress ?? undefined, existingTokenCurrency)
  const existingTokenTotalSupply = useTotalSupply(isCreateNew ? undefined : existingTokenCurrency)

  const tokenSymbol = isCreateNew
    ? tokenForm.createNew.symbol
    : (tokenForm.existing.existingTokenCurrencyInfo?.currency.symbol ?? '')

  // User's spendable balance — drives how much they can put up for auction
  const maxAuctionSupplyAmount = isCreateNew ? String(NEW_TOKEN_TOTAL_SUPPLY) : existingTokenBalance?.toExact()
  // Full on-chain total supply — used for FDV calculations
  const tokenTotalSupply = isCreateNew ? String(NEW_TOKEN_TOTAL_SUPPLY) : existingTokenTotalSupply?.toExact()

  const handleBootstrapLiquidity = useCallback(() => setAuctionType(AuctionType.BOOTSTRAP_LIQUIDITY), [setAuctionType])
  const handleFundraise = useCallback(() => setAuctionType(AuctionType.FUNDRAISE), [setAuctionType])
  const handleStartTimeChange = useCallback(
    (date: Date | undefined) => updateConfigureAuctionField('startTime', date),
    [updateConfigureAuctionField],
  )
  const handleDecrement = useCallback(
    () => setMaxDurationDays(Math.max(1, maxDurationDays - 1)),
    [setMaxDurationDays, maxDurationDays],
  )
  const handleIncrement = useCallback(
    () => setMaxDurationDays(maxDurationDays + 1),
    [setMaxDurationDays, maxDurationDays],
  )

  const auctionSupplyAmount =
    maxAuctionSupplyAmount && auctionSupplyPercent
      ? (parseFloat(maxAuctionSupplyAmount) * auctionSupplyPercent) / 100
      : 0
  const isNextStepDisabled = !startTime || auctionSupplyAmount === 0 || !floorPrice

  return (
    <Flex gap="$spacing16">
      <TokenSummaryCard onEdit={goToPreviousStep} />

      <Flex row gap="$spacing12">
        <HookTile
          selected={auctionType === AuctionType.BOOTSTRAP_LIQUIDITY}
          title={t('toucan.createAuction.step.configureAuction.auctionType.bootstrapLiquidity')}
          titleVariant="buttonLabel2"
          description={t('toucan.createAuction.step.configureAuction.auctionType.bootstrapLiquidity.description')}
          descriptionVariant="body3"
          onPress={handleBootstrapLiquidity}
        />
        <HookTile
          selected={auctionType === AuctionType.FUNDRAISE}
          title={t('toucan.createAuction.step.configureAuction.auctionType.fundraise')}
          titleVariant="buttonLabel2"
          description={t('toucan.createAuction.step.configureAuction.auctionType.fundraise.description')}
          descriptionVariant="body3"
          onPress={handleFundraise}
        />
      </Flex>

      <Flex
        backgroundColor="$surface1"
        borderWidth="$spacing1"
        borderColor="$surface3"
        borderRadius="$rounded20"
        p="$spacing24"
        gap="$spacing24"
      >
        <Flex borderBottomWidth={1} borderBottomColor="$surface3" pb="$spacing12">
          <Text variant="heading3" color="$neutral1">
            {t('toucan.createAuction.step.configureAuction.title')}
          </Text>
        </Flex>

        <Flex gap="$spacing40">
          <DurationSection
            maxDurationDays={maxDurationDays}
            startTime={startTime}
            onStartTimeChange={handleStartTimeChange}
            onDecrement={handleDecrement}
            onIncrement={handleIncrement}
          />

          <AuctionSupplySection
            auctionSupplyPercent={auctionSupplyPercent}
            maxAuctionSupplyAmount={maxAuctionSupplyAmount}
            tokenSymbol={tokenSymbol}
            supplyCurve={supplyCurve}
            onSelectPercent={setAuctionSupplyPercent}
            onSelectSupplyCurve={setSupplyCurve}
          />

          <RaiseCurrencySection raiseCurrency={raiseCurrency} onSelect={setRaiseCurrency} />

          <FloorPriceSection
            chainId={chainId}
            floorPrice={floorPrice}
            raiseCurrency={raiseCurrency}
            tokenTotalSupply={tokenTotalSupply}
            onFloorPriceChange={setFloorPrice}
          />
        </Flex>
        <AdvancedSettingsRow />
      </Flex>

      <Flex row>
        <Button size="medium" emphasis="primary" onPress={goToNextStep} isDisabled={isNextStepDisabled} fill>
          {t('common.button.continue')}
        </Button>
      </Flex>
    </Flex>
  )
}

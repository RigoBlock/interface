import { BigNumber } from '@ethersproject/bignumber'
import { formatUnits } from '@ethersproject/units'
import { Trans, useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { ChainPill } from '~/components/ChainPill'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { HYPERLIQUID_BRIDGE_EVM_CHAINS } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'
import type { HyperliquidBridgeQuote } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeQuote'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ON_CHAIN_MAX_BRIDGE_FEE_BPS } from '~/state/sagas/transactions/bridgeCalldata'

/** Safety margin under the on-chain 2% cap: fees above 1.5% leave no room for solver compensation. */
export const MAX_RELAY_FEE_BPS = ON_CHAIN_MAX_BRIDGE_FEE_BPS - 50

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `~${Math.round(totalSeconds)}s`
  }
  return `~${Math.round(totalSeconds / 60)}min`
}

/** Converts a raw token amount between USDC decimal conventions (e.g. BSC 18dp → 6dp). */
export function scaleRawDecimals(params: {
  value: BigNumber
  sourceDecimals: number
  destinationDecimals: number
}): BigNumber {
  const { value, sourceDecimals, destinationDecimals } = params
  if (destinationDecimals >= sourceDecimals) {
    return value.mul(BigNumber.from(10).pow(destinationDecimals - sourceDecimals))
  }
  return value.div(BigNumber.from(10).pow(sourceDecimals - destinationDecimals))
}

export type BridgeInputErrorKey = 'enter-amount' | 'exceeds-balance' | 'amount-too-low' | 'fee-too-high' | 'not-feasible'

export function getBridgeInputErrorKey(params: {
  amount: string
  balanceUsd: number
  quote: HyperliquidBridgeQuote | undefined
  standardCalldata: string | undefined
  isFeasible: boolean
}): BridgeInputErrorKey | undefined {
  const { amount, balanceUsd, quote, standardCalldata, isFeasible } = params
  const amountNumber = Number(amount)
  if (!amount || !Number.isFinite(amountNumber) || amountNumber <= 0) {
    return 'enter-amount'
  }
  if (amountNumber > balanceUsd) {
    return 'exceeds-balance'
  }
  if (quote?.isAmountTooLow) {
    return 'amount-too-low'
  }
  if (quote && quote.totalRelayFeeBps > MAX_RELAY_FEE_BPS) {
    return 'fee-too-high'
  }
  if (standardCalldata && !isFeasible) {
    return 'not-feasible'
  }
  return undefined
}

/** Pool's source-chain USDC balance with a "max" shortcut. */
export function BridgePoolBalanceRow({
  chainLabel,
  balanceLabel,
  isLoadingBalance,
  onMax,
}: {
  chainLabel: string
  balanceLabel: string | undefined
  isLoadingBalance: boolean
  onMax: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <Flex row justifyContent="space-between">
      <Text variant="body3" color="$neutral2">
        {t('perps.hyperliquid.bridge.poolBalance', { chain: chainLabel })}
      </Text>
      <Flex row gap="$spacing8" alignItems="center">
        <Text variant="body3">
          {isLoadingBalance || balanceLabel === undefined ? t('perps.modal.loading') : `${balanceLabel} USDC`}
        </Text>
        <Text variant="body3" color="$accent1" cursor="pointer" onPress={onMax}>
          {t('perps.hyperliquid.transfer.max')}
        </Text>
      </Flex>
    </Flex>
  )
}

/** Selectable chain chips for the non-HyperEVM bridge endpoint. */
export function BridgeChainChips({
  selectedChainId,
  onSelect,
}: {
  selectedChainId: UniverseChainId
  onSelect: (chainId: UniverseChainId) => void
}): JSX.Element {
  return (
    <Flex row gap="$spacing8" flexWrap="wrap">
      {HYPERLIQUID_BRIDGE_EVM_CHAINS.map((chainId) => (
        <ChainPill key={chainId} active={selectedChainId === chainId} onPress={() => onSelect(chainId)}>
          <ChainLogo chainId={chainId} size={16} />
          <Text variant="buttonLabel4">{getChainInfo(chainId).label}</Text>
        </ChainPill>
      ))}
    </Flex>
  )
}

export function BridgeQuoteDetails({
  quote,
  isLoading,
  isError,
  sourceDecimals,
  destinationDecimals,
}: {
  quote: HyperliquidBridgeQuote | undefined
  isLoading: boolean
  isError: boolean
  sourceDecimals: number
  destinationDecimals: number
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <Flex gap="$spacing8" padding="$spacing16" borderRadius="$rounded12" backgroundColor="$surface2">
      {quote && !isLoading ? (
        <>
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('perps.hyperliquid.bridge.youReceive')}
            </Text>
            <Text variant="body3">{formatUnits(quote.outputAmountRaw, destinationDecimals)} USDC</Text>
          </Flex>
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('perps.hyperliquid.bridge.fee')}
            </Text>
            <Text variant="body3">
              {formatUnits(quote.totalRelayFeeRaw, sourceDecimals)} USDC ({(quote.totalRelayFeeBps / 100).toFixed(2)}%)
            </Text>
          </Flex>
          {quote.estimatedFillTimeSec !== undefined && (
            <Flex row justifyContent="space-between">
              <Text variant="body3" color="$neutral2">
                {t('perps.hyperliquid.bridge.estimatedTime')}
              </Text>
              <Text variant="body3">{formatSeconds(quote.estimatedFillTimeSec)}</Text>
            </Flex>
          )}
        </>
      ) : (
        <Text variant="body3" color="$neutral2">
          {isError ? t('perps.hyperliquid.bridge.quoteError') : t('perps.modal.loading')}
        </Text>
      )}
    </Flex>
  )
}

/** Loading / submitted views after the user confirms in their wallet. */
export function BridgeStatusView({
  attempting,
  hash,
  transactionSuccess,
  confirmed,
  onDismiss,
}: {
  attempting: boolean
  hash: string | undefined
  transactionSuccess: boolean
  confirmed: boolean
  onDismiss: () => void
}): JSX.Element | null {
  if (attempting && !hash) {
    return (
      <LoadingView onDismiss={onDismiss}>
        <Text variant="body2" color="$neutral2" textAlign="center">
          <Trans i18nKey="perps.modal.confirmInWallet" />
        </Text>
      </LoadingView>
    )
  }
  if (hash) {
    return (
      <SubmittedView onDismiss={onDismiss} hash={hash} transactionSuccess={transactionSuccess}>
        {confirmed && transactionSuccess && (
          <Text variant="body2" color="$neutral2" textAlign="center">
            <Trans i18nKey="perps.hyperliquid.bridge.submitted" />
          </Text>
        )}
      </SubmittedView>
    )
  }
  return null
}

import { formatUnits, parseUnits } from '@ethersproject/units'
import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, SegmentedControl, Text } from 'ui/src'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { wagmiConfig } from '~/components/Web3Provider/wagmiConfig'
import {
  HYPERLIQUID_BRIDGE_EVM_CHAINS,
  HYPERLIQUID_BRIDGE_USDC,
} from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'
import { onNumericInput } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import {
  buildStandardAcrossDepositV3Calldata,
  useHyperliquidBridgeCallback,
} from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeCallback'
import { useHyperliquidBridgeQuote, type HyperliquidBridgeQuote } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeQuote'
import {
  checkSmartPoolBridgeFeasibility,
  modifyAcrossDepositV3ForSmartPool,
  ON_CHAIN_MAX_BRIDGE_FEE_BPS,
  OpType,
} from '~/state/sagas/transactions/bridgeCalldata'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'
import { assume0xAddress } from '~/utils/wagmi'

const MODAL_TRANSITION_DURATION = 200

/** Safety margin under the on-chain 2% cap: fees above 1.5% leave no room for solver compensation. */
const MAX_RELAY_FEE_BPS = ON_CHAIN_MAX_BRIDGE_FEE_BPS - 50

const BRIDGE_USDC_DECIMALS = 6

type BridgeDirection = 'toHyperEvm' | 'fromHyperEvm'

interface HyperliquidBridgeModalProps {
  isOpen: boolean
  /** The smart pool (vault) address — deterministic, same on every chain. */
  poolAddress?: string
  onDismiss: () => void
}

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `~${Math.round(totalSeconds)}s`
  }
  return `~${Math.round(totalSeconds / 60)}min`
}

type BridgeInputErrorKey = 'enter-amount' | 'exceeds-balance' | 'amount-too-low' | 'fee-too-high' | 'not-feasible'

function getBridgeInputErrorKey(params: {
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

function BridgeQuoteDetails({
  quote,
  isLoading,
  isError,
}: {
  quote: HyperliquidBridgeQuote | undefined
  isLoading: boolean
  isError: boolean
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
            <Text variant="body3">{formatUnits(quote.outputAmountRaw, BRIDGE_USDC_DECIMALS)} USDC</Text>
          </Flex>
          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('perps.hyperliquid.bridge.fee')}
            </Text>
            <Text variant="body3">
              {formatUnits(quote.totalRelayFeeRaw, BRIDGE_USDC_DECIMALS)} USDC ({(quote.totalRelayFeeBps / 100).toFixed(2)}%)
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

export function HyperliquidBridgeModal({ isOpen, poolAddress, onDismiss }: HyperliquidBridgeModalProps): JSX.Element {
  const { t } = useTranslation()
  const [direction, setDirection] = useState<BridgeDirection>('toHyperEvm')
  const [selectedChainId, setSelectedChainId] = useState<UniverseChainId>(UniverseChainId.ArbitrumOne)
  const [amount, setAmount] = useState('')

  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const { sendBridgeTransaction } = useHyperliquidBridgeCallback(poolAddress)

  const sourceChainId = direction === 'toHyperEvm' ? selectedChainId : UniverseChainId.HyperEvm
  const destinationChainId = direction === 'toHyperEvm' ? UniverseChainId.HyperEvm : selectedChainId
  const sourceUsdc = HYPERLIQUID_BRIDGE_USDC[sourceChainId]
  const destinationUsdc = HYPERLIQUID_BRIDGE_USDC[destinationChainId]

  const inputAmountRaw = useMemo(() => {
    if (!amount) {
      return undefined
    }
    try {
      const parsed = parseUnits(amount, BRIDGE_USDC_DECIMALS)
      return parsed.gt(0) ? parsed : undefined
    } catch {
      return undefined
    }
  }, [amount])

  // Pool's USDC balance on the source chain (the bridgeable balance).
  const { data: balanceRaw, isLoading: isLoadingBalance } = useReadContract({
    address: sourceUsdc ? assume0xAddress(sourceUsdc.address) : undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: poolAddress ? [assume0xAddress(poolAddress)] : undefined,
    chainId: sourceChainId as (typeof wagmiConfig)['chains'][number]['id'],
    query: { enabled: isOpen && !!poolAddress && !!sourceUsdc, refetchInterval: 15_000 },
  })
  const balanceUsd = balanceRaw !== undefined ? Number(formatUnits(balanceRaw, BRIDGE_USDC_DECIMALS)) : 0

  const { quote, isLoading: isLoadingQuote, isError: isQuoteError } = useHyperliquidBridgeQuote({
    sourceChainId,
    destinationChainId,
    inputAmountRaw,
    enabled: isOpen && !!poolAddress,
  })

  // Standard Across calldata for the feasibility check and the vault rewrite.
  const standardCalldata = useMemo(() => {
    if (!poolAddress || !sourceUsdc || !destinationUsdc || !inputAmountRaw || !quote) {
      return undefined
    }
    try {
      return buildStandardAcrossDepositV3Calldata({
        poolAddress,
        inputToken: sourceUsdc.address,
        outputToken: destinationUsdc.address,
        inputAmount: inputAmountRaw,
        // The solver must deliver input − total relay fee (both 6dp USDC).
        outputAmount: inputAmountRaw.sub(quote.totalRelayFeeRaw),
        destinationChainId,
        quoteTimestamp: quote.quoteTimestamp,
      })
    } catch (error) {
      logger.warn('HyperliquidBridgeModal', 'standardCalldata', 'Failed to build depositV3 calldata', { error })
      return undefined
    }
  }, [destinationChainId, destinationUsdc, inputAmountRaw, poolAddress, quote, sourceUsdc])

  const isFeasible = useMemo(() => {
    if (!standardCalldata) {
      return true
    }
    return checkSmartPoolBridgeFeasibility({
      calldata: standardCalldata,
      inputTokenDecimals: BRIDGE_USDC_DECIMALS,
      outputTokenDecimals: BRIDGE_USDC_DECIMALS,
      outputTokenPriceUSD: 1,
      destinationChainId,
    }).isFeasible
  }, [destinationChainId, standardCalldata])

  const inputErrorKey = useMemo(
    () => getBridgeInputErrorKey({ amount, balanceUsd, quote, standardCalldata, isFeasible }),
    [amount, balanceUsd, isFeasible, quote, standardCalldata],
  )

  const inputErrorLabel = useMemo(() => {
    switch (inputErrorKey) {
      case 'enter-amount':
        return t('perps.hyperliquid.transfer.errors.enterAmount')
      case 'exceeds-balance':
        return t('perps.hyperliquid.bridge.errors.exceedsBalance', { chain: getChainInfo(sourceChainId).label })
      case 'amount-too-low':
        return t('perps.hyperliquid.bridge.errors.amountTooLow')
      case 'fee-too-high':
        return t('perps.hyperliquid.bridge.errors.feeTooHigh')
      case 'not-feasible':
        return t('perps.hyperliquid.bridge.errors.notFeasible')
      default:
        return undefined
    }
  }, [inputErrorKey, sourceChainId, t])

  const canSubmit =
    !!poolAddress && !!standardCalldata && !!quote && !inputErrorKey && !isLoadingQuote && !isQuoteError

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setAttempting(false)
      setErrorReason(undefined)
      setAmount('')
      setDirection('toHyperEvm')
      setSelectedChainId(UniverseChainId.ArbitrumOne)
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    if (!poolAddress || !standardCalldata || !canSubmit) {
      return
    }
    setAttempting(true)
    setErrorReason(undefined)
    try {
      // Rewrite the standard Across calldata into the Rigoblock vault depositV3 calldata.
      const calldata = modifyAcrossDepositV3ForSmartPool({
        calldata: standardCalldata,
        smartPoolAddress: poolAddress,
        value: '0',
        opType: OpType.Transfer,
        outputTokenPriceUSD: 1,
        outputTokenDecimals: BRIDGE_USDC_DECIMALS,
        inputTokenDecimals: BRIDGE_USDC_DECIMALS,
      })
      const txHash = await sendBridgeTransaction({ sourceChainId, calldata })
      if (txHash) {
        setHash(txHash)
      } else {
        setAttempting(false)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('HyperliquidBridgeModal', 'onSubmit', message)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={640}>
      {!attempting && !hash ? (
        <Flex gap="$spacing16" padding="$spacing24">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="subheading1">{t('perps.hyperliquid.bridge.title')}</Text>
            <Text cursor="pointer" onPress={wrappedOnDismiss} color="$neutral2">
              ✕
            </Text>
          </Flex>

          <Text variant="body3" color="$neutral2">
            <Trans i18nKey="perps.hyperliquid.bridge.description" />
          </Text>

          <SegmentedControl
            options={[
              { value: 'toHyperEvm' as BridgeDirection, display: <Trans i18nKey="perps.hyperliquid.bridge.toHyperEvm" /> },
              { value: 'fromHyperEvm' as BridgeDirection, display: <Trans i18nKey="perps.hyperliquid.bridge.fromHyperEvm" /> },
            ]}
            selectedOption={direction}
            onSelectOption={(value) => {
              setDirection(value)
              setErrorReason(undefined)
            }}
            fullWidth
          />

          <Flex gap="$spacing8">
            <Text variant="body3" color="$neutral2">
              {direction === 'toHyperEvm'
                ? t('perps.hyperliquid.bridge.sourceChain')
                : t('perps.hyperliquid.bridge.destinationChain')}
            </Text>
            <Flex row gap="$spacing8" flexWrap="wrap">
              {HYPERLIQUID_BRIDGE_EVM_CHAINS.map((chainId) => (
                <Button
                  key={chainId}
                  variant="default"
                  emphasis={selectedChainId === chainId ? 'primary' : 'secondary'}
                  size="small"
                  fill={false}
                  onPress={() => setSelectedChainId(chainId)}
                >
                  <Flex row gap="$spacing4" alignItems="center">
                    <ChainLogo chainId={chainId} size={16} />
                    <Text variant="buttonLabel4">{getChainInfo(chainId).label}</Text>
                  </Flex>
                </Button>
              ))}
            </Flex>
          </Flex>

          <Flex gap="$spacing4">
            <Text variant="body3" color="$neutral2">
              {t('perps.hyperliquid.bridge.amount')}
            </Text>
            <Input
              value={amount}
              onChangeText={(next) => onNumericInput(next, setAmount)}
              placeholder="0.0"
              inputMode="decimal"
              height={44}
              backgroundColor="$surface2"
              borderColor="$surface3"
            />
          </Flex>

          <Flex row justifyContent="space-between">
            <Text variant="body3" color="$neutral2">
              {t('perps.hyperliquid.bridge.poolBalance', { chain: getChainInfo(sourceChainId).label })}
            </Text>
            <Flex row gap="$spacing8" alignItems="center">
              <Text variant="body3">
                {isLoadingBalance ? t('perps.modal.loading') : `${balanceUsd.toFixed(2)} USDC`}
              </Text>
              <Text
                variant="body3"
                color="$accent1"
                cursor="pointer"
                onPress={() => setAmount(balanceUsd.toFixed(BRIDGE_USDC_DECIMALS).replace(/\.?0+$/, ''))}
              >
                {t('perps.hyperliquid.transfer.max')}
              </Text>
            </Flex>
          </Flex>

          {inputAmountRaw && (
            <BridgeQuoteDetails quote={quote} isLoading={isLoadingQuote} isError={isQuoteError} />
          )}

          {errorReason && (
            <Text variant="body3" color="$statusCritical">
              {errorReason}
            </Text>
          )}

          <Button
            variant="branded"
            size="medium"
            isDisabled={!canSubmit}
            onPress={() => {
              setErrorReason(undefined)
              onSubmit()
            }}
          >
            {inputErrorLabel ?? t('perps.hyperliquid.bridge.submit')}
          </Button>
        </Flex>
      ) : attempting && !hash ? (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <Text variant="body2" color="$neutral2" textAlign="center">
            <Trans i18nKey="perps.modal.confirmInWallet" />
          </Text>
        </LoadingView>
      ) : hash ? (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          {confirmed && transactionSuccess && (
            <Text variant="body2" color="$neutral2" textAlign="center">
              <Trans i18nKey="perps.hyperliquid.bridge.submitted" />
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}

import { formatUnits, parseUnits } from '@ethersproject/units'
import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, SegmentedControl, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { wagmiConfig } from '~/components/Web3Provider/wagmiConfig'
import { HYPERLIQUID_BRIDGE_USDC } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'
import { onNumericInput } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import {
  BridgeChainChips,
  BridgePoolBalanceRow,
  BridgeQuoteDetails,
  BridgeStatusView,
  getBridgeInputErrorKey,
  scaleRawDecimals,
} from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidBridgeModalParts'
import {
  buildStandardAcrossDepositV3Calldata,
  useHyperliquidBridgeCallback,
} from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeCallback'
import { useHyperliquidBridgeQuote } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeQuote'
import { checkSmartPoolBridgeFeasibility, modifyAcrossDepositV3ForSmartPool, OpType } from '~/state/sagas/transactions/bridgeCalldata'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'
import { assume0xAddress } from '~/utils/wagmi'

const MODAL_TRANSITION_DURATION = 200

type BridgeDirection = 'toHyperEvm' | 'fromHyperEvm'

interface HyperliquidBridgeModalProps {
  isOpen: boolean
  /** The smart pool (vault) address — deterministic, same on every chain. */
  poolAddress?: string
  onDismiss: () => void
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
  const sourceDecimals = sourceUsdc?.decimals ?? 6
  const destinationDecimals = destinationUsdc?.decimals ?? 6

  const inputAmountRaw = useMemo(() => {
    if (!amount) {
      return undefined
    }
    try {
      const parsed = parseUnits(amount, sourceDecimals)
      return parsed.gt(0) ? parsed : undefined
    } catch {
      return undefined
    }
  }, [amount, sourceDecimals])

  // Pool's USDC balance on the source chain (the bridgeable balance).
  const { data: balanceRaw, isLoading: isLoadingBalance } = useReadContract({
    address: sourceUsdc ? assume0xAddress(sourceUsdc.address) : undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: poolAddress ? [assume0xAddress(poolAddress)] : undefined,
    chainId: sourceChainId as (typeof wagmiConfig)['chains'][number]['id'],
    query: { enabled: isOpen && !!poolAddress && !!sourceUsdc, refetchInterval: 15_000 },
  })
  const balanceLabel = balanceRaw !== undefined ? formatUnits(balanceRaw, sourceDecimals) : undefined

  const balanceUsd = balanceLabel !== undefined ? Number(balanceLabel) : 0

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
        // Across returns the solver-delivered amount in OUTPUT token raw units; fall back to
        // input − fee scaled across decimals when the field is missing.
        outputAmount:
          quote.outputAmountRaw.gt(0)
            ? quote.outputAmountRaw
            : scaleRawDecimals({
                value: inputAmountRaw.sub(quote.totalRelayFeeRaw),
                sourceDecimals,
                destinationDecimals,
              }),
        destinationChainId,
        quoteTimestamp: quote.quoteTimestamp,
      })
    } catch (error) {
      logger.warn('HyperliquidBridgeModal', 'standardCalldata', 'Failed to build depositV3 calldata', { error })
      return undefined
    }
  }, [destinationChainId, destinationDecimals, destinationUsdc, inputAmountRaw, poolAddress, quote, sourceDecimals, sourceUsdc])

  const isFeasible = useMemo(() => {
    if (!standardCalldata) {
      return true
    }
    return checkSmartPoolBridgeFeasibility({
      calldata: standardCalldata,
      inputTokenDecimals: sourceDecimals,
      outputTokenDecimals: destinationDecimals,
      outputTokenPriceUSD: 1,
      destinationChainId,
    }).isFeasible
  }, [destinationChainId, destinationDecimals, sourceDecimals, standardCalldata])

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

  const chainPickerLabel =
    direction === 'toHyperEvm'
      ? t('perps.hyperliquid.bridge.sourceChain')
      : t('perps.hyperliquid.bridge.destinationChain')

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
        outputTokenDecimals: destinationDecimals,
        inputTokenDecimals: sourceDecimals,
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
              {chainPickerLabel}
            </Text>
            <BridgeChainChips selectedChainId={selectedChainId} onSelect={setSelectedChainId} />
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

          <BridgePoolBalanceRow
            chainLabel={getChainInfo(sourceChainId).label}
            balanceLabel={balanceLabel}
            isLoadingBalance={isLoadingBalance}
            onMax={() => balanceLabel !== undefined && setAmount(balanceLabel.replace(/\.?0+$/, ''))}
          />

          {inputAmountRaw && (
            <BridgeQuoteDetails
              quote={quote}
              isLoading={isLoadingQuote}
              isError={isQuoteError}
              sourceDecimals={sourceDecimals}
              destinationDecimals={destinationDecimals}
            />
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
      ) : (
        <BridgeStatusView
          attempting={attempting}
          hash={hash}
          transactionSuccess={transactionSuccess}
          confirmed={confirmed}
          onDismiss={wrappedOnDismiss}
        />
      )}
    </Modal>
  )
}

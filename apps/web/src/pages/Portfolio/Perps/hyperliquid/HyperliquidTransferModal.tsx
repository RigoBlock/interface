import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, SegmentedControl, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { SPOT_SEND_GAS_USDC } from '~/pages/Portfolio/Perps/hyperliquid/hlAdapterAbi'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'
import { useHyperliquidOrderCallback } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidOrderCallback'
import { onNumericInput } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

type TransferTab = 'deposit' | 'withdraw'

interface HyperliquidTransferModalProps {
  isOpen: boolean
  poolAddress?: string
  /** Live Core perp account value in USD. */
  perpsAccountValueUsd: number
  /** Live Core spot USDC balance in USD. */
  spotUsdcBalanceUsd: number
  /** Live USD withdrawable from the perp account. */
  withdrawableUsd: number
  onDismiss: () => void
}

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <Flex gap="$spacing4">
      <Text variant="body3" color="$neutral2">
        {label}
      </Text>
      <Input
        value={value}
        onChangeText={(next) => onNumericInput(next, onChange)}
        placeholder="0.0"
        inputMode="decimal"
        height={44}
        backgroundColor="$surface2"
        borderColor="$surface3"
      />
    </Flex>
  )
}

function LiveBalanceRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Flex row justifyContent="space-between">
      <Text variant="body3" color="$neutral2">
        {label}
      </Text>
      <Text variant="body3">{value}</Text>
    </Flex>
  )
}

export function HyperliquidTransferModal({
  isOpen,
  poolAddress,
  perpsAccountValueUsd,
  spotUsdcBalanceUsd,
  withdrawableUsd,
  onDismiss,
}: HyperliquidTransferModalProps): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TransferTab>('deposit')
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawStep, setWithdrawStep] = useState<1 | 2>(1)
  const [step1Amount, setStep1Amount] = useState('')
  const [step2Amount, setStep2Amount] = useState('')

  const [hash, setHash] = useState<string | undefined>()
  const [step1Hash, setStep1Hash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success
  const step1Confirmed = useIsTransactionConfirmed(step1Hash)

  const { balanceUsd: evmUsdcBalanceUsd, isLoading: isLoadingBalance } = useHyperEvmUsdcBalance(poolAddress)
  const { sendHlDeposit, sendHlUsdClassTransfer, sendHlSpotSend } = useHyperliquidOrderCallback(poolAddress)

  // Advance the withdrawal wizard once the perp→spot transfer confirms on-chain
  useEffect(() => {
    if (step1Hash && step1Confirmed) {
      setWithdrawStep(2)
      setStep2Amount(step1Amount)
      setHash(undefined)
      setAttempting(false)
    }
  }, [step1Hash, step1Confirmed, step1Amount])

  const depositError = useMemo(() => {
    const amount = Number(depositAmount)
    if (!depositAmount || !Number.isFinite(amount) || amount <= 0) {
      return t('perps.hyperliquid.transfer.errors.enterAmount')
    }
    if (amount > evmUsdcBalanceUsd) {
      return t('perps.hyperliquid.transfer.errors.exceedsBalance')
    }
    return undefined
  }, [depositAmount, evmUsdcBalanceUsd, t])

  const step1Error = useMemo(() => {
    const amount = Number(step1Amount)
    if (!step1Amount || !Number.isFinite(amount) || amount <= 0) {
      return t('perps.hyperliquid.transfer.errors.enterAmount')
    }
    if (amount > withdrawableUsd) {
      return t('perps.hyperliquid.transfer.errors.exceedsWithdrawable')
    }
    return undefined
  }, [step1Amount, t, withdrawableUsd])

  const step2Error = useMemo(() => {
    const amount = Number(step2Amount)
    if (!step2Amount || !Number.isFinite(amount) || amount <= 0) {
      return t('perps.hyperliquid.transfer.errors.enterAmount')
    }
    if (amount > spotUsdcBalanceUsd) {
      return t('perps.hyperliquid.transfer.errors.exceedsSpotBalance')
    }
    if (spotUsdcBalanceUsd - amount < SPOT_SEND_GAS_USDC) {
      return t('perps.hyperliquid.transfer.errors.spotGasResidual', { amount: SPOT_SEND_GAS_USDC })
    }
    return undefined
  }, [step2Amount, spotUsdcBalanceUsd, t])

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setStep1Hash(undefined)
      setAttempting(false)
      setErrorReason(undefined)
      setDepositAmount('')
      setStep1Amount('')
      setStep2Amount('')
      setWithdrawStep(1)
      setTab('deposit')
    }, MODAL_TRANSITION_DURATION)
  }

  async function submit(action: () => Promise<string> | undefined, onHash?: (txHash: string) => void) {
    setAttempting(true)
    setErrorReason(undefined)
    const txHash = await action()?.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('HyperliquidTransferModal', 'submit', message)
    })
    if (txHash) {
      setHash(txHash)
      onHash?.(txHash)
    } else {
      setAttempting(false)
    }
  }

  const formattedUsd = (value: number): string =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={640}>
      {!attempting && !hash ? (
        <Flex gap="$spacing16" padding="$spacing24">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="subheading1">{t('perps.hyperliquid.transfer.title')}</Text>
            <Text cursor="pointer" onPress={wrappedOnDismiss} color="$neutral2">
              ✕
            </Text>
          </Flex>

          <SegmentedControl
            options={[
              { value: 'deposit' as TransferTab, display: <Trans i18nKey="perps.hyperliquid.transfer.deposit.tab" /> },
              { value: 'withdraw' as TransferTab, display: <Trans i18nKey="perps.hyperliquid.transfer.withdraw.tab" /> },
            ]}
            selectedOption={tab}
            onSelectOption={(value) => {
              setTab(value)
              setErrorReason(undefined)
            }}
            fullWidth
          />

          <Flex gap="$spacing12" padding="$spacing16" borderRadius="$rounded12" backgroundColor="$surface2">
            <LiveBalanceRow label={t('perps.hyperliquid.transfer.perpsAccountValue')} value={formattedUsd(perpsAccountValueUsd)} />
            <LiveBalanceRow label={t('perps.hyperliquid.transfer.coreSpotBalance')} value={formattedUsd(spotUsdcBalanceUsd)} />
          </Flex>

          {tab === 'deposit' ? (
            <>
              <AmountInput label={t('perps.hyperliquid.transfer.deposit.amount')} value={depositAmount} onChange={setDepositAmount} />
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  {t('perps.hyperliquid.transfer.deposit.evmBalance')}
                </Text>
                <Flex row gap="$spacing8" alignItems="center">
                  <Text variant="body3">{isLoadingBalance ? t('perps.modal.loading') : formattedUsd(evmUsdcBalanceUsd)}</Text>
                  <Text
                    variant="body3"
                    color="$accent1"
                    cursor="pointer"
                    onPress={() => setDepositAmount(evmUsdcBalanceUsd.toFixed(6).replace(/\.?0+$/, ''))}
                  >
                    {t('perps.hyperliquid.transfer.max')}
                  </Text>
                </Flex>
              </Flex>
              <Text variant="body4" color="$neutral2">
                {t('perps.hyperliquid.transfer.deposit.settlementNote')}
              </Text>
              {depositError && !!depositAmount && (
                <Text variant="body3" color="$statusCritical">
                  {depositError}
                </Text>
              )}
              <Button
                variant="branded"
                size="medium"
                isDisabled={!!depositError || !poolAddress}
                onPress={() => submit(() => sendHlDeposit(Number(depositAmount)))}
              >
                {depositError ?? t('perps.hyperliquid.transfer.deposit.submit')}
              </Button>
            </>
          ) : (
            <>
              {withdrawStep === 1 ? (
                <>
                  <Text variant="body3" fontWeight="600">
                    {t('perps.hyperliquid.transfer.withdraw.step1')}
                  </Text>
                  <AmountInput label={t('perps.hyperliquid.transfer.withdraw.amount')} value={step1Amount} onChange={setStep1Amount} />
                  <Flex row justifyContent="space-between">
                    <Text variant="body3" color="$neutral2">
                      {t('perps.hyperliquid.transfer.withdraw.available')}
                    </Text>
                    <Text variant="body3">{formattedUsd(withdrawableUsd)}</Text>
                  </Flex>
                  {step1Error && !!step1Amount && (
                    <Text variant="body3" color="$statusCritical">
                      {step1Error}
                    </Text>
                  )}
                  <Button
                    variant="branded"
                    size="medium"
                    isDisabled={!!step1Error || !poolAddress}
                    onPress={() =>
                      submit(() => sendHlUsdClassTransfer(Number(step1Amount)), (txHash) => setStep1Hash(txHash))
                    }
                  >
                    {step1Error ?? t('perps.hyperliquid.transfer.withdraw.step1Submit')}
                  </Button>
                  {spotUsdcBalanceUsd > SPOT_SEND_GAS_USDC && (
                    <Button
                      variant="default"
                      emphasis="secondary"
                      size="small"
                      alignSelf="center"
                      onPress={() => {
                        setWithdrawStep(2)
                        setErrorReason(undefined)
                      }}
                    >
                      {t('perps.hyperliquid.transfer.withdraw.goToStep2')}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Text variant="body3" fontWeight="600">
                    {t('perps.hyperliquid.transfer.withdraw.step2')}
                  </Text>
                  <AmountInput label={t('perps.hyperliquid.transfer.withdraw.amount')} value={step2Amount} onChange={setStep2Amount} />
                  <Text variant="body4" color="$neutral2">
                    {t('perps.hyperliquid.transfer.withdraw.activationNote')}
                  </Text>
                  {step2Error && !!step2Amount && (
                    <Text variant="body3" color="$statusCritical">
                      {step2Error}
                    </Text>
                  )}
                  <Button
                    variant="branded"
                    size="medium"
                    isDisabled={!!step2Error || !poolAddress}
                    onPress={() => submit(() => sendHlSpotSend(Number(step2Amount)))}
                  >
                    {step2Error ?? t('perps.hyperliquid.transfer.withdraw.step2Submit')}
                  </Button>
                  <Button
                    variant="default"
                    emphasis="secondary"
                    size="small"
                    alignSelf="center"
                    onPress={() => {
                      setWithdrawStep(1)
                      setErrorReason(undefined)
                    }}
                  >
                    {t('perps.hyperliquid.transfer.withdraw.backToStep1')}
                  </Button>
                </>
              )}
            </>
          )}

          {errorReason && (
            <Text variant="body3" color="$statusCritical">
              {errorReason}
            </Text>
          )}
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
              <Trans
                i18nKey={
                  tab === 'deposit'
                    ? 'perps.hyperliquid.modal.depositSubmitted'
                    : 'perps.hyperliquid.modal.withdrawSubmitted'
                }
              />
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}

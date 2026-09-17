import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { GmxClaimableFunding } from '~/pages/Portfolio/Perps/gmx/useGmxClaimableFundingFees'
import { useGmxClaimFundingFeesCallback } from '~/pages/Portfolio/Perps/gmx/useGmxClaimFundingFeesCallback'
import { formatUsd } from '~/pages/Portfolio/Perps/perpsTableShared'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

interface GmxClaimFundingFeesModalProps {
  isOpen: boolean
  poolAddress?: string
  claims: GmxClaimableFunding[]
  totalClaimableUsd: number
  onDismiss: () => void
}

export function GmxClaimFundingFeesModal({
  isOpen,
  poolAddress,
  claims,
  totalClaimableUsd,
  onDismiss,
}: GmxClaimFundingFeesModalProps): JSX.Element {
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const { sendGmxClaimFundingFees } = useGmxClaimFundingFeesCallback(poolAddress)

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    setAttempting(true)
    setErrorReason(undefined)
    const txHash = await sendGmxClaimFundingFees(claims).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('GmxClaimFundingFeesModal', 'onSubmit', message)
    })
    if (txHash) {
      setHash(txHash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={360}>
      {!attempting && !hash ? (
        <Flex gap="$spacing16" padding="$spacing24">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="subheading1">
              <Trans i18nKey="perps.gmx.claimFundingFees.title" />
            </Text>
            <Text cursor="pointer" onPress={wrappedOnDismiss} color="$neutral2">
              ✕
            </Text>
          </Flex>
          <Text variant="body3" color="$neutral2">
            {totalClaimableUsd > 0 ? (
              <Trans
                i18nKey="perps.gmx.claimFundingFees.description"
                values={{ amount: formatUsd(totalClaimableUsd), count: claims.length }}
              />
            ) : (
              <Trans i18nKey="perps.gmx.claimFundingFees.descriptionUnpriced" values={{ count: claims.length }} />
            )}
          </Text>
          <Flex gap="$spacing4">
            {claims.map((claim) => (
              <Flex key={`${claim.market}-${claim.token}`} row justifyContent="space-between">
                <Text variant="body3" color="$neutral2">
                  {claim.symbol}
                </Text>
                <Text variant="body3">{claim.amountText}</Text>
              </Flex>
            ))}
          </Flex>
          {errorReason && (
            <Text variant="body3" color="$statusCritical">
              {errorReason}
            </Text>
          )}
          <Button
            variant="branded"
            size="medium"
            isDisabled={claims.length === 0}
            onPress={() => {
              setErrorReason(undefined)
              onSubmit()
            }}
          >
            <Trans i18nKey="perps.gmx.claimFundingFees.confirm" />
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
              <Trans i18nKey="perps.gmx.claimFundingFees.submitted" />
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}

interface GmxClaimFundingFeesButtonProps {
  isOperator: boolean
  /** Number of market/token pairs with a positive raw claim amount. */
  claimsCount: number
  /** Total claimable in USD (0 when a token price is unavailable — gating must not depend on it). */
  totalClaimableUsd: number
  onPress: () => void
}

/** Operator-gated entry point shown whenever a positive claim exists (priced or not). */
export function GmxClaimFundingFeesButton({
  isOperator,
  claimsCount,
  totalClaimableUsd,
  onPress,
}: GmxClaimFundingFeesButtonProps): JSX.Element | null {
  const { t } = useTranslation()
  if (!isOperator || claimsCount === 0) {
    return null
  }
  return (
    <Button variant="branded" size="small" fill={false} onPress={onPress}>
      {totalClaimableUsd > 0
        ? t('perps.gmx.claimFundingFees.button', { amount: formatUsd(totalClaimableUsd) })
        : t('perps.gmx.claimFundingFees.buttonUnpriced')}
    </Button>
  )
}

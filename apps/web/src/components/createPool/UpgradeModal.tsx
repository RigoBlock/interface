import { Trans } from 'react-i18next'
import { ReactNode, useState } from 'react'
import { X } from 'react-feather'
import styled from 'lib/styled-components'
import { ThemedText } from 'theme/components/text'
import { TransactionStatus } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { ModalName} from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'

import { useUpgradeCallback } from 'state/pool/hooks'
import { useIsTransactionConfirmed, useTransaction } from 'state/transactions/hooks'
import { ButtonError } from 'components/Button/buttons'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import { useAccount } from 'hooks/useAccount'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

interface UpgradeModalProps {
  isOpen: boolean
  implementation: string
  onDismiss: () => void
  title: ReactNode
}

export default function UpgradeModal({ isOpen, implementation, onDismiss, title }: UpgradeModalProps) {
  const account = useAccount()

  const upgradeCallback = useUpgradeCallback()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Confirmed

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onUpgrade() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!account.address || !account.chainId || !upgradeCallback) {
      return
    }

    // try set spread and store hash
    const hash = await upgradeCallback()?.catch((error) => {
      setAttempting(false)
      logger.info('UpgradeModal', 'onUpgrade', error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={480}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
              <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
            </RowBetween>
            <ButtonError onClick={onUpgrade} disabled={!implementation}>
              <ThemedText.DeprecatedMediumHeader color="white">
                <Trans>Upgrade Implementation</Trans>
              </ThemedText.DeprecatedMediumHeader>
            </ButtonError>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Upgrading Implementation to {implementation}</Trans>
            </ThemedText.DeprecatedLargeHeader>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          <AutoColumn gap="12px" justify="center">
            {!confirmed ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Submitted</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>Upgrading implementation</Trans>
                </ThemedText.DeprecatedBody>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>Implementation Upgraded</Trans>
                </ThemedText.DeprecatedBody>
              </>
            ) : (
              <ThemedText.DeprecatedLargeHeader>
                <Trans>Transaction Failed</Trans>
              </ThemedText.DeprecatedLargeHeader>
            )}
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

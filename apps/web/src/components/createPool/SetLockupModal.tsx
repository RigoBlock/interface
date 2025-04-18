import { parseUnits } from '@ethersproject/units'
import { Trans } from 'react-i18next'
import JSBI from 'jsbi'
import { ReactNode, useCallback, useState } from 'react'
import { X } from 'react-feather'
import styled from 'lib/styled-components'
import { ThemedText } from 'theme/components/text'
import { TransactionStatus } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { ModalName} from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'

import { useSetLockupCallback } from 'state/pool/hooks'
import { useIsTransactionConfirmed, useTransaction } from 'state/transactions/hooks'
import { ButtonError } from 'components/Button/buttons'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import NameInputPanel from 'components/NameInputPanel'
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

interface SetLockupModalProps {
  isOpen: boolean
  currentLockup: string
  onDismiss: () => void
  title: ReactNode
}

export default function SetLockupModal({ isOpen, currentLockup, onDismiss, title }: SetLockupModalProps) {
  const account = useAccount()

  const [typed, setTyped] = useState('')

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback((typed: string) => {
    const numberRegEx = RegExp(`^[0-9]*$`)
    if (numberRegEx.test(String(typed))) {
      setTyped(typed)
    }
  }, [])

  const setLockupCallback = useSetLockupCallback()

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

  let parsedLockup = ''
  try {
    parsedLockup = (Number(parseUnits(typed, 0)) * 86400).toString()
  } catch (error) {
    const message = `failed to parse input amount: "${typed}"`
    logger.debug('SetLockupModal', 'wrappedOnDismiss', message, error)
  }

  async function onSetLockup() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!account.address || !account.chainId || !setLockupCallback || !parsedLockup) {
      return
    }

    // the minimum acceptable value is 2 seconds
    if (parsedLockup === '0') {
      parsedLockup = '2'
    }

    // try set lockup and store hash
    const hash = await setLockupCallback(parsedLockup)?.catch((error) => {
      setAttempting(false)
      logger.info('SetLockupModal', 'onSetLockup', error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  const isSameAsCurrent: boolean = (parsedLockup !== '0' ? parsedLockup : '2').toString() === currentLockup
  const isLockupTooBig: boolean = JSBI.greaterThan(JSBI.BigInt(parsedLockup), JSBI.BigInt(2592000))

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={480}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
              <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
            </RowBetween>
            <ThemedText.DeprecatedBody>
              <Trans>The minimum holder lockup.</Trans>
            </ThemedText.DeprecatedBody>
            <NameInputPanel
              value={(typed ? Number(parsedLockup) / 86400 : '').toString()}
              onChange={onUserInput}
              label="Lockup (days)"
              placeholder="max 30 days"
            />
            <ButtonError
              disabled={parsedLockup === '' || isSameAsCurrent || isLockupTooBig}
              error={isSameAsCurrent || isLockupTooBig}
              onClick={onSetLockup}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                {isSameAsCurrent ? (
                  <Trans>Same as current</Trans>
                ) : isLockupTooBig ? (
                  <Trans>max lockup 30 days</Trans>
                ) : (
                  <Trans>Set Lockup</Trans>
                )}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonError>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Setting New Lockup</Trans>
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
                  <Trans>Setting lockup to {(Number(parsedLockup) / 86400).toFixed(0)} days</Trans>
                </ThemedText.DeprecatedBody>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>Lockup set to {(Number(parsedLockup) / 86400).toFixed(0)} days</Trans>
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

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

import { useSetSpreadCallback } from 'state/pool/hooks'
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

interface SetSpreadModalProps {
  isOpen: boolean
  currentSpread: number
  onDismiss: () => void
  title: ReactNode
}

export default function SetSpreadModal({ isOpen, currentSpread, onDismiss, title }: SetSpreadModalProps) {
  const account = useAccount()

  // state for create input
  const [typed, setTyped] = useState('')

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback((typed: string) => {
    const numberRegEx = RegExp(`^[0-9]*[.,]?[0-9]*$`)
    if (numberRegEx.test(String(typed))) {
      setTyped(typed)
    }
  }, [])

  let parsedSpread = ''
  try {
    parsedSpread = typed !== '' ? parseUnits(typed, 2).toString() : typed
  } catch (error) {
    const message = `failed to parse spread: "${typed}"`
    logger.debug('SetSpreadModal', 'SetSpreadModal', message, error)
  }
  const isSameAsCurrent: boolean = currentSpread === Number(parsedSpread)

  const setSpreadCallback = useSetSpreadCallback()

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

  async function onSetSpread() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!account.address || !account.chainId || !setSpreadCallback || !parsedSpread) {
      return
    }

    // try set spread and store hash
    const hash = await setSpreadCallback(parsedSpread)?.catch((error) => {
      setAttempting(false)
      logger.info('SetSpreadModal', 'onSetSpread', error)
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
            <NameInputPanel value={typed} onChange={onUserInput} label="Pool Spread (%)" placeholder="max 10%" />
            <ButtonError
              disabled={
                typed === '' ||
                typed.length > 4 ||
                isSameAsCurrent ||
                JSBI.lessThan(JSBI.BigInt(parsedSpread), JSBI.BigInt(1)) ||
                JSBI.greaterThan(JSBI.BigInt(parsedSpread), JSBI.BigInt(1000))
              }
              error={isSameAsCurrent || JSBI.greaterThan(JSBI.BigInt(parsedSpread), JSBI.BigInt(1000))}
              onClick={onSetSpread}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                {isSameAsCurrent ? (
                  <Trans>Same as current</Trans>
                ) : JSBI.greaterThan(JSBI.BigInt(parsedSpread), JSBI.BigInt(1000)) ? (
                  <Trans>max spread 10%</Trans>
                ) : (
                  <Trans>Update Spread</Trans>
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
              <Trans>Updating Spread</Trans>
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
                  <Trans>Setting spread to {Number(parsedSpread) / 100}%</Trans>
                </ThemedText.DeprecatedBody>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>Spread set to {Number(parsedSpread) / 100}%</Trans>
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

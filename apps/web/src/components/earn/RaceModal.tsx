import { Token } from '@uniswap/sdk-core'
import { Trans } from 'react-i18next'
import { ReactNode, useState } from 'react'
import { X } from 'react-feather'
import styled from 'lib/styled-components'
import { ThemedText } from 'theme/components/text'
import { GRG } from 'uniswap/src/constants/tokens'
import { TransactionStatus } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { ModalName} from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'

import { useRaceCallback } from 'state/stake/hooks'
import { useIsTransactionConfirmed, useTransaction } from 'state/transactions/hooks'
import { ButtonPrimary } from 'components/Button/buttons'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import { useAccount } from 'hooks/useAccount'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const NameText = styled.span`
  font-weight: 600;
  font-size: 18px;
`

const BoldText = styled.span`
  font-weight: 600;
`

const EmphasisText = styled.span`
  font-style: italic;
`

interface RaceModalProps {
  isOpen: boolean
  poolAddress?: string
  poolName?: string
  onDismiss: () => void
  title: ReactNode
}

const MODAL_TRANSITION_DURATION = 200

export default function RaceModal({ isOpen, poolAddress, poolName, onDismiss, title }: RaceModalProps) {
  const { chainId } = useAccount()

  const [currencyValue] = useState<Token | undefined>(GRG[chainId ?? UniverseChainId.Mainnet])
  const raceCallback = useRaceCallback()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [errorReason, setErrorReason] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Confirmed

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      // Reset local state after the modal dismiss animation finishes, to avoid UI flicker as it dismisses
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
    }, MODAL_TRANSITION_DURATION)
  }

  async function onRace() {
    // if callback not returned properly ignore
    if (!raceCallback || !poolAddress || !poolName || !currencyValue?.isToken) {
      return
    }
    setAttempting(true)

    // try credit reward and store hash
    const hash = await raceCallback(poolAddress)?.catch((error) => {
      setErrorReason(error.reason)
      setAttempting(false)
      logger.info('RaceModal', 'onRace', error)
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
            {!errorReason ? (
              <>
                <RowBetween>
                  <p>
                    <Trans>
                      Enroll <NameText>{poolName}</NameText> to compete for the network rewards. To race,{' '}
                      <EmphasisText>the pool requires actively staked GRG</EmphasisText>. This action only needs to be
                      run once per each epoch.
                    </Trans>
                    <p></p>
                    <Trans>
                      The smart pool must have a positive <BoldText>own</BoldText> stake, and a minimum 100 GRG{' '}
                      <BoldText>delegated</BoldText> stake, otherwise won&apos;t be able to participate in rewards.
                    </Trans>
                  </p>
                </RowBetween>
                <ButtonPrimary disabled={false} onClick={onRace}>
                  <ThemedText.DeprecatedMediumHeader color="white">
                    <Trans>Race</Trans>{' '}
                  </ThemedText.DeprecatedMediumHeader>
                </ButtonPrimary>
              </>
            ) : errorReason === 'execution reverted: POP_STAKING_POOL_BALANCES_NULL_ERROR' ? (
              <RowBetween>
                <p>
                  <NameText>{poolName}</NameText> does not have an active GRG stake. If you are its pool operator,
                  select your pool and click the <EmphasisText>Stake</EmphasisText> button at the bottom of the page,
                  then select <EmphasisText>Stake from Pool.</EmphasisText> This will allow you to stake from the pool
                  in 1 click.
                </p>
              </RowBetween>
            ) : errorReason === 'execution reverted: STAKING_STAKE_BELOW_MINIMUM_ERROR' ? (
              <RowBetween>
                <p>
                  <NameText>{poolName}</NameText> does not have the minimum 100 GRG delegated stake. Stake more to reach
                  the minimum. The community&apos;s delegated stake counts.
                </p>
              </RowBetween>
            ) : (
              <p>User rejected transaction</p>
            )}
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Enrolling Pool</Trans>
            </ThemedText.DeprecatedLargeHeader>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              {!confirmed ? (
                <Trans>Transaction Submitted</Trans>
              ) : transactionSuccess ? (
                <Trans>Transaction Confirmed</Trans>
              ) : (
                <Trans>Transaction Error</Trans>
              )}
            </ThemedText.DeprecatedLargeHeader>
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

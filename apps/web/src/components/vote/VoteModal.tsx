import Circle from 'assets/images/blue-loader.svg'
import { ButtonPrimary } from 'components/Button/buttons'
import { AutoColumn, ColumnCenter } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { useAccount } from 'hooks/useAccount'
import styled, { useTheme } from 'lib/styled-components'
import { useState } from 'react'
import { ArrowUpCircle, X } from 'react-feather'
import { useUserVotes, useVoteCallback } from 'state/governance/hooks'
import { VoteOption } from 'state/governance/types'
import { CustomLightSpinner, ThemedText } from 'theme/components'
import { ExternalLink } from 'theme/components/Links'
import { Trans } from 'react-i18next'
import { Flex } from 'ui/src'
import { ModalName} from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const ConfirmOrLoadingWrapper = styled.div`
  width: 100%;
  padding: 24px;
`

const ConfirmedIcon = styled(ColumnCenter)`
  padding: 60px 0;
`

interface VoteModalProps {
  isOpen: boolean
  onDismiss: () => void
  voteOption?: VoteOption
  proposalId?: string // id for the proposal to vote on
}

export default function VoteModal({ isOpen, onDismiss, proposalId, voteOption }: VoteModalProps) {
  const { chainId } = useAccount()
  const voteCallback = useVoteCallback()
  const { votes: availableVotes } = useUserVotes()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState<boolean>(false)

  // get theme for colors
  const theme = useTheme()

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onVote() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!voteCallback || voteOption === undefined) {
      return
    }

    // try delegation and store hash
    const hash = await voteCallback(proposalId, voteOption)?.catch((error) => {
      setAttempting(false)
      logger.info('VoteModal', 'onVote', error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight="90vh">
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={535}>
                {voteOption === VoteOption.Against ? (
                  <Trans i18nKey="account.transactionSummary.vote.against" values={{ proposalKey: proposalId }} />
                ) : voteOption === VoteOption.For ? (
                  <Trans i18nKey="account.transactionSummary.vote.for" values={{ proposalKey: proposalId }} />
                ) : (
                  <Trans i18nKey="account.transactionSummary.vote.abstain" values={{ proposalKey: proposalId }} />
                )}
              </ThemedText.DeprecatedMediumHeader>
              <StyledClosed onClick={wrappedOnDismiss} />
            </RowBetween>
            <ThemedText.DeprecatedLargeHeader>
              <Trans i18nKey="vote.landing.voteAmount" values={{ amount: formatCurrencyAmount(availableVotes, 4) }} />
            </ThemedText.DeprecatedLargeHeader>
            <ButtonPrimary onClick={onVote}>
              <ThemedText.DeprecatedMediumHeader color="white">
                {voteOption === VoteOption.Against ? (
                  <Trans i18nKey="account.transactionSummary.vote.against" values={{ proposalKey: proposalId }} />
                ) : voteOption === VoteOption.For ? (
                  <Trans i18nKey="account.transactionSummary.vote.for" values={{ proposalKey: proposalId }} />
                ) : (
                  <Trans i18nKey="account.transactionSummary.vote.abstain" values={{ proposalKey: proposalId }} />
                )}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <ConfirmOrLoadingWrapper>
          <RowBetween>
            <Flex />
            <StyledClosed onClick={wrappedOnDismiss} />
          </RowBetween>
          <ConfirmedIcon>
            <CustomLightSpinner src={Circle} alt="loader" size="90px" />
          </ConfirmedIcon>
          <AutoColumn gap="100px" justify="center">
            <AutoColumn gap="md" justify="center">
              <ThemedText.DeprecatedLargeHeader>
                <Trans i18nKey="vote.submitting" />
              </ThemedText.DeprecatedLargeHeader>
            </AutoColumn>
            <ThemedText.DeprecatedSubHeader>
              <Trans i18nKey="common.confirm" />
            </ThemedText.DeprecatedSubHeader>
          </AutoColumn>
        </ConfirmOrLoadingWrapper>
      )}
      {hash && (
        <ConfirmOrLoadingWrapper>
          <RowBetween>
            <Flex />
            <StyledClosed onClick={wrappedOnDismiss} />
          </RowBetween>
          <ConfirmedIcon>
            <ArrowUpCircle strokeWidth={0.5} size={90} color={theme.accent1} />
          </ConfirmedIcon>
          <AutoColumn gap="100px" justify="center">
            <AutoColumn gap="md" justify="center">
              <ThemedText.DeprecatedLargeHeader>
                <Trans i18nKey="common.transactionSubmitted" />
              </ThemedText.DeprecatedLargeHeader>
            </AutoColumn>
            {chainId && (
              <ExternalLink
                href={getExplorerLink(chainId, hash, ExplorerDataType.TRANSACTION)}
                style={{ marginLeft: '4px' }}
              >
                <ThemedText.DeprecatedSubHeader>
                  <Trans i18nKey="common.exploere.link" />
                </ThemedText.DeprecatedSubHeader>
              </ExternalLink>
            )}
          </AutoColumn>
        </ConfirmOrLoadingWrapper>
      )}
    </Modal>
  )
}
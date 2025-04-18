import { ButtonDropdownLight } from 'components/Button/buttons'
import Column from 'components/deprecated/Column'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { RowBetween } from 'components/deprecated/Row'
import { MenuItem, PaddedColumn, Separator } from 'components/SearchModal/styled'
import styled from 'lib/styled-components'
import { useCallback } from 'react'
import { Text } from 'rebass'
import { ModalCloseIcon } from 'ui/src'
import { Trans } from 'react-i18next'
import { ModalName} from 'uniswap/src/features/telemetry/constants'

export enum ProposalAction {
  TRANSFER_TOKEN = 'Transfer Token',
  APPROVE_TOKEN = 'Approve Token',
  UPGRADE_IMPLEMENTATION = 'Protocol: Upgrade',
  UPGRADE_GOVERNANCE = 'Governance: Upgrade',
  UPGRADE_STAKING = 'Staking: Upgrade',
  ADD_ADAPTER = 'Protocol: Add Adapter',
  REMOVE_ADAPTER = 'Protocol: Remove Adapter',
}

interface ProposalActionSelectorModalProps {
  isOpen: boolean
  onDismiss: () => void
  onProposalActionSelect: (proposalAction: ProposalAction) => void
}

const ContentWrapper = styled(Column)`
  width: 100%;
  flex: 1 1;
  position: relative;
`
const ActionSelectorHeader = styled.div`
  font-size: 14px;
  font-weight: 535;
  color: ${({ theme }) => theme.neutral2};
  margin-bottom: 10px;
`

const ActionDropdown = styled(ButtonDropdownLight)`
  padding: 0px;
  background-color: transparent;
  color: ${({ theme }) => theme.neutral1};
  font-size: 1.25rem;

  :hover,
  :active,
  :focus {
    outline: 0px;
    box-shadow: none;
    background-color: transparent;
  }
`

const ProposalActionSelectorFlex = styled.div`
  margin-top: 10px;
  display: flex;
  flex-flow: column nowrap;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.surface3};
  background-color: ${({ theme }) => theme.surface1};
`

const ProposalActionSelectorContainer = styled.div`
  display: flex;
  flex: 1;
  justify-content: flex-start;
  flex-direction: column;
  padding: 1em;
`

export const ProposalActionSelector = ({
  className,
  onClick,
  proposalAction,
}: {
  className?: string
  onClick: () => void
  proposalAction: ProposalAction
}) => {
  return (
    <ProposalActionSelectorFlex>
      <ProposalActionSelectorContainer className={className}>
        <ActionSelectorHeader>
          <Trans i18nKey="proposal.action" />
        </ActionSelectorHeader>
        <ActionDropdown onClick={onClick}>{proposalAction}</ActionDropdown>
      </ProposalActionSelectorContainer>
    </ProposalActionSelectorFlex>
  )
}

export function ProposalActionSelectorModal({
  isOpen,
  onDismiss,
  onProposalActionSelect,
}: ProposalActionSelectorModalProps) {
  const handleProposalActionSelect = useCallback(
    (proposalAction: ProposalAction) => {
      onProposalActionSelect(proposalAction)
      onDismiss()
    },
    [onDismiss, onProposalActionSelect],
  )

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={onDismiss}>
      <ContentWrapper>
        <PaddedColumn gap="16px">
          <RowBetween>
            <Text fontWeight={535} fontSize={16}>
              <Trans i18nKey="common.selectAction.label" />
            </Text>
            <ModalCloseIcon onClose={onDismiss} />
          </RowBetween>
        </PaddedColumn>
        <Separator />
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.UPGRADE_IMPLEMENTATION)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>Protocol: Upgrade</Trans>
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.ADD_ADAPTER)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>Protocol: Add Adapter</Trans>
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.REMOVE_ADAPTER)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>Protocol: Remove Adapter</Trans>
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.UPGRADE_STAKING)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>Staking: Upgrade</Trans>
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.UPGRADE_GOVERNANCE)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>Governance: Upgrade</Trans>
            </Text>
          </Column>
        </MenuItem>
        {/* The following lines are commented until governance holds tokens
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.TRANSFER_TOKEN)}>
          <Column>
            <Text fontWeight={535}>
              <Trans i18nKey="vote.proposal.transferToken" />
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.APPROVE_TOKEN)}>
          <Column>
            <Text fontWeight={535}>
              <Trans i18nKey="vote.proposal.approveToken" />
            </Text>
          </Column>
        </MenuItem>
        */}
      </ContentWrapper>
    </Modal>
  )
}

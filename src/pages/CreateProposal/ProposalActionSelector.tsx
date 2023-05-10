import { Trans } from '@lingui/macro'
import { ButtonDropdown } from 'components/Button'
import Column from 'components/Column'
import Modal from 'components/Modal'
import { RowBetween } from 'components/Row'
import { MenuItem, PaddedColumn, Separator } from 'components/SearchModal/styleds'
import React, { useCallback } from 'react'
import { Text } from 'rebass'
import styled from 'styled-components/macro'
import { CloseIcon } from 'theme'

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
  font-weight: 500;
  color: ${({ theme }) => theme.deprecated_text2};
`

const ActionDropdown = styled(ButtonDropdown)`
  padding: 0px;
  background-color: transparent;
  color: ${({ theme }) => theme.deprecated_text1};
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
  border: 1px solid ${({ theme }) => theme.deprecated_bg2};
  background-color: ${({ theme }) => theme.deprecated_bg1};
`

const ProposalActionSelectorContainer = styled.div`
  flex: 1;
  padding: 1rem;
  display: grid;
  grid-auto-rows: auto;
  grid-row-gap: 10px;
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
          <Trans>Proposed Action</Trans>
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
    [onDismiss, onProposalActionSelect]
  )

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss}>
      <ContentWrapper>
        <PaddedColumn gap="16px">
          <RowBetween>
            <Text fontWeight={500} fontSize={16}>
              <Trans>Select an action</Trans>
            </Text>
            <CloseIcon onClick={onDismiss} />
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
            <Text fontWeight={500}>
              <Trans>GRG: Transfer Token</Trans>
            </Text>
          </Column>
        </MenuItem>
        <MenuItem onClick={() => handleProposalActionSelect(ProposalAction.APPROVE_TOKEN)}>
          <Column>
            <Text fontWeight={500}>
              <Trans>GRG: Approve Token</Trans>
            </Text>
          </Column>
        </MenuItem>
        */}
      </ContentWrapper>
    </Modal>
  )
}

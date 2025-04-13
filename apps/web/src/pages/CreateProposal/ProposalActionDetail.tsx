import { Currency } from '@uniswap/sdk-core'
import AddressInputPanel from 'components/AddressInputPanel'
import CurrencyInputPanel from 'components/CurrencyInputPanel'
import styled from 'lib/styled-components'
import { ProposalAction } from 'pages/CreateProposal/ProposalActionSelector'
import { Trans } from 'react-i18next'

enum ProposalActionDetailField {
  ADDRESS = 0,
  CURRENCY = 1,
}

const ProposalActionDetailContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  > * {
    width: 100%;
  }
  > :not(:last-child) {
    margin-bottom: 10px;
  }
`

export const ProposalActionDetail = ({
  className,
  proposalAction,
  currency,
  amount,
  toAddress,
  onCurrencySelect,
  onAmountInput,
  onToAddressInput,
}: {
  className?: string
  proposalAction: ProposalAction
  currency?: Currency
  amount: string
  toAddress: string
  onCurrencySelect: (currency: Currency) => void
  onAmountInput: (amount: string) => void
  onToAddressInput: (address: string) => void
}) => {
  const proposalActionsData = {
    [ProposalAction.TRANSFER_TOKEN]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans i18nKey="common.to" />,
      },
      {
        type: ProposalActionDetailField.CURRENCY,
      },
    ],
    [ProposalAction.APPROVE_TOKEN]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans i18nKey="common.to" />,
      },
      {
        type: ProposalActionDetailField.CURRENCY,
      },
    ],
    [ProposalAction.UPGRADE_IMPLEMENTATION]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans>New Pool Implementation</Trans>,
      },
    ],
    [ProposalAction.UPGRADE_GOVERNANCE]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans>New Governance Implementation</Trans>,
      },
    ],
    [ProposalAction.UPGRADE_STAKING]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans>New Staking Implementation</Trans>,
      },
    ],
    [ProposalAction.ADD_ADAPTER]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans>New Application Adapter</Trans>,
      },
    ],
    [ProposalAction.REMOVE_ADAPTER]: [
      {
        type: ProposalActionDetailField.ADDRESS,
        label: <Trans>Existing Application Adapter</Trans>,
      },
    ],
  }

  return (
    <ProposalActionDetailContainer className={className}>
      {proposalActionsData[proposalAction].map((field, i) =>
        field.type === ProposalActionDetailField.ADDRESS ? (
          <AddressInputPanel key={i} label={field.label} value={toAddress} onChange={onToAddressInput} />
        ) : field.type === ProposalActionDetailField.CURRENCY ? (
          <CurrencyInputPanel
            key={i}
            value={amount}
            currency={currency}
            onUserInput={(amount: string) => onAmountInput(amount)}
            onCurrencySelect={(currency: Currency) => onCurrencySelect(currency)}
            showMaxButton={false}
            showCurrencyAmount={false}
            hideBalance
            id="currency-input"
          />
        ) : null,
      )}
    </ProposalActionDetailContainer>
  )
}

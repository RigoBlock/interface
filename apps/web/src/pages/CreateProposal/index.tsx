/* eslint-disable max-lines */
import { Interface } from '@ethersproject/abi'
import { getAddress, isAddress } from '@ethersproject/address'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { ButtonError } from 'components/Button/buttons'
import { BlueCard } from 'components/Card/cards'
import { AutoColumn } from 'components/deprecated/Column'
import {
  AUTHORITY_ADDRESSES,
  GOVERNANCE_PROXY_ADDRESSES,
  RB_FACTORY_ADDRESSES,
  STAKING_PROXY_ADDRESSES,
} from 'constants/addresses'
import { useAccount } from 'hooks/useAccount'
import JSBI from 'jsbi'
import styled from 'lib/styled-components'
import tryParseCurrencyAmount from 'lib/utils/tryParseCurrencyAmount'
import { BodyWrapper } from 'pages/App/AppBody'
import { ProposalActionDetail } from 'pages/CreateProposal/ProposalActionDetail'
import {
  ProposalAction,
  ProposalActionSelector,
  ProposalActionSelectorModal,
} from 'pages/CreateProposal/ProposalActionSelector'
import { ProposalEditor } from 'pages/CreateProposal/ProposalEditor'
import { ProposalSubmissionModal } from 'pages/CreateProposal/ProposalSubmissionModal'
import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, X } from 'react-feather'
import { Trans } from 'react-i18next'
import { Link } from 'react-router'
import { CreateProposalData, useCreateProposalCallback, useVotingParams } from 'state/governance/hooks'
import { ThemedText } from 'theme/components'
import { ExternalLink, StyledInternalLink } from 'theme/components/Links'
import AUTHORITY_ABI from 'uniswap/src/abis/authority.json'
import TOKEN_ABI from 'uniswap/src/abis/erc20.json'
import GOVERNANCE_RB_ABI from 'uniswap/src/abis/governance.json'
import RB_POOL_FACTORY_ABI from 'uniswap/src/abis/rb-pool-factory.json'
import STAKING_PROXY_ABI from 'uniswap/src/abis/staking-proxy.json'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

const PageWrapper = styled(AutoColumn)`
  padding: 68px 8px 0px;

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.md}px`}) {
    padding: 48px 8px 0px;
  }

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.sm}px`}) {
    padding-top: 20px;
  }
`

const BackArrow = styled(ArrowLeft)`
  cursor: pointer;
  color: ${({ theme }) => theme.neutral1};
`
const Nav = styled(Link)`
  align-items: center;
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  margin: 1em 0 0 1em;
  text-decoration: none;
`

const HeaderText = styled(ThemedText.H1Small)`
  margin: auto !important;
`

const CreateProposalButton = ({
  proposalThreshold,
  hasActiveOrPendingProposal,
  hasEnoughVote,
  isFormInvalid,
  handleCreateProposal,
}: {
  proposalThreshold?: CurrencyAmount<Token>
  hasActiveOrPendingProposal: boolean
  hasEnoughVote: boolean
  isFormInvalid: boolean
  handleCreateProposal: () => void
}) => {
  const formattedProposalThreshold = proposalThreshold
    ? JSBI.divide(
        proposalThreshold.quotient,
        JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(proposalThreshold.currency.decimals)),
      ).toLocaleString()
    : undefined

  return (
    <ButtonError
      style={{ marginTop: '18px' }}
      error={hasActiveOrPendingProposal || !hasEnoughVote}
      disabled={isFormInvalid || hasActiveOrPendingProposal || !hasEnoughVote}
      onClick={handleCreateProposal}
    >
      {hasActiveOrPendingProposal ? (
        <Trans i18nKey="vote.proposal.activeOrPendingProposal" />
      ) : !hasEnoughVote ? (
        <>
          {formattedProposalThreshold ? (
            <Trans
              i18nKey="vote.proposal.voteThreshold"
              values={{
                formattedProposalThreshold,
              }}
            />
          ) : (
            <Trans i18nKey="vote.proposal.notEnoughVotes" />
          )}
        </>
      ) : (
        <Trans i18nKey="vote.landing.createProposal" />
      )}
    </ButtonError>
  )
}

const Wrapper = styled.div`
  position: relative;
  padding: 20px;
`

const CreateProposalWrapper = styled(Wrapper)`
  display: flex;
  flex-flow: column wrap;
`

const AutonomousProposalCTA = styled.div`
  text-align: center;
  margin-top: 10px;
`

const AddActionButton = styled.button`
  margin-top: 10px;
  padding: 8px 16px;
  background-color: ${({ theme }) => theme.accent1};
  color: ${({ theme }) => theme.neutral1};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  &:hover {
    background-color: ${({ theme }) => theme.accent2};
  }
`

const ActionContainer = styled.div`
  position: relative;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.neutral3};
  border-radius: 8px;
`

const RemoveActionButton = styled(X)`
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: pointer;
  color: ${({ theme }) => theme.neutral2};
  &:hover {
    color: ${({ theme }) => theme.neutral1};
  }
`

// TODO: verify which params to make optional
interface ActionData {
  id: number
  proposalAction: ProposalAction
  toAddress: string
  currency: Currency
  amount: string
  methods?: string[]
  values?: (string | boolean)[][]
  target?: string
}

export default function CreateProposal() {
  const account = useAccount()
  const { userVotingPower: availableVotes, proposalThreshold } = useVotingParams(account.address)

  //const [modalOpen, setModalOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState<{ open: boolean; actionId?: number }>({ open: false })
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [actions, setActions] = useState<ActionData[]>([
    {
      id: 1,
      proposalAction: ProposalAction.UPGRADE_IMPLEMENTATION,
      toAddress: '',
      currency: GRG[account.chainId ?? UniverseChainId.Mainnet],
      amount: '',
    },
  ])
  const [titleValue, setTitleValue] = useState('')
  const [bodyValue, setBodyValue] = useState('')

  const handleActionSelectorClick = useCallback((actionId: number) => {
    setModalOpen({ open: true, actionId })
  }, [])

  const handleActionChange = useCallback((proposalAction: ProposalAction, actionId: number) => {
    setActions((prev) => prev.map((action) => (action.id === actionId ? { ...action, proposalAction } : action)))
    setModalOpen({ open: false })
  }, [])

  const handleDismissActionSelector = useCallback(() => {
    setModalOpen({ open: false })
  }, [])

  const handleDismissSubmissionModal = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
  }, [])

  const handleToAddressInput = useCallback((toAddress: string, actionId: number) => {
    setActions((prev) => prev.map((action) => (action.id === actionId ? { ...action, toAddress } : action)))
  }, [])

  const handleCurrencySelect = useCallback((currency: Currency, actionId: number) => {
    setActions((prev) => prev.map((action) => (action.id === actionId ? { ...action, currency } : action)))
  }, [])

  const handleAmountInput = useCallback((amount: string, actionId: number) => {
    setActions((prev) => prev.map((action) => (action.id === actionId ? { ...action, amount } : action)))
  }, [])

  const handleTitleInput = useCallback((title: string) => {
    setTitleValue(title)
  }, [])

  const handleBodyInput = useCallback((body: string) => {
    setBodyValue(body)
  }, [])

  const handleAddAction = useCallback(() => {
    setActions((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        proposalAction: ProposalAction.UPGRADE_IMPLEMENTATION,
        toAddress: '',
        currency: GRG[account.chainId ?? UniverseChainId.Mainnet],
        amount: '',
      },
    ])
  }, [account.chainId])

  const handleRemoveAction = useCallback((actionId: number) => {
    setActions((prev) => prev.filter((action) => action.id !== actionId))
  }, [])

  const isFormInvalid = useMemo(
    () =>
      Boolean(
        actions.length === 0 ||
          actions.some(
            (action) =>
              !isAddress(action.toAddress) ||
              !action.currency.isToken ||
              (action.proposalAction === ProposalAction.TRANSFER_TOKEN && action.amount === '') ||
              (action.proposalAction === ProposalAction.APPROVE_TOKEN && action.amount === ''),
          ) ||
          titleValue === '' ||
          bodyValue === '',
      ),
    [actions, titleValue, bodyValue],
  )

  const hasEnoughVote = Boolean(
    availableVotes && proposalThreshold && JSBI.greaterThanOrEqual(availableVotes.quotient, proposalThreshold.quotient),
  )

  const createProposalCallback = useCreateProposalCallback()

  const handleCreateProposal = async () => {
    setAttempting(true)

    const createProposalData: CreateProposalData = {} as CreateProposalData

    if (typeof createProposalCallback !== 'function') {
      setAttempting(false)
      return
    }

    createProposalData.description = `# ${titleValue}\n\n${bodyValue}`
    createProposalData.actions = []

    for (const action of actions) {
      // TODO: verify action.currency.isToken
      if (!action.currency.isToken) {
        setAttempting(false)
        return
      }
      const tokenAmount = tryParseCurrencyAmount(action.amount, action.currency)

      let values: (string | boolean)[][]
      let methods: string[] = []
      let target: string = ''
      let interfaces: Interface[] = []

      // TODO: add all governance owned methods
      switch (action.proposalAction) {
        case ProposalAction.TRANSFER_TOKEN: {
          if (!tokenAmount) {
            setAttempting(false)
            return
          }
          values = [[getAddress(action.toAddress), tokenAmount.quotient.toString()]]
          interfaces = [new Interface(TOKEN_ABI)]
          target = action.currency.address
          methods = ['transfer']
          break
        }

        case ProposalAction.APPROVE_TOKEN: {
          if (!tokenAmount) {
            return
          }
          values = [[getAddress(action.toAddress), tokenAmount.quotient.toString()]]
          interfaces = [new Interface(TOKEN_ABI)]
          target = action.currency.address
          methods = ['approve']
          break
        }

        case ProposalAction.UPGRADE_IMPLEMENTATION: {
          values = [[getAddress(action.toAddress)]]
          interfaces = [new Interface(RB_POOL_FACTORY_ABI)]
          target = RB_FACTORY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]
          methods = ['setImplementation']
          break
        }

        case ProposalAction.UPGRADE_GOVERNANCE: {
          values = [[getAddress(action.toAddress)]]
          interfaces = [new Interface(GOVERNANCE_RB_ABI)]
          target = GOVERNANCE_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]
          methods = ['upgradeImplementation']
          break
        }

        case ProposalAction.UPGRADE_STAKING: {
          values = [
            [STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]],
            [],
            [getAddress(action.toAddress)],
            [STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]],
          ]
          interfaces = [new Interface(STAKING_PROXY_ABI)]
          target = STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]
          methods = [
            'addAuthorizedAddress',
            'detachStakingContract',
            'attachStakingContract',
            'removeAuthorizedAddress',
          ]
          break
        }

        // any non-empty string for the boolean value will result in adding an adapter
        case ProposalAction.ADD_ADAPTER: {
          values = [[getAddress(action.toAddress), true]]
          interfaces = [new Interface(AUTHORITY_ABI)]
          target = AUTHORITY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]
          methods = ['setAdapter']
          break
        }

        // an empty string for the boolean value will result in removing an adapter
        case ProposalAction.REMOVE_ADAPTER: {
          values = [[getAddress(action.toAddress), false]]
          interfaces = [new Interface(AUTHORITY_ABI)]
          target = AUTHORITY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]
          methods = ['setAdapter']
          break
        }
      }

      for (let i = 0; i < values.length; i++) {
        createProposalData.actions.push({
          target,
          value: 0,
          data: interfaces[0].encodeFunctionData(methods[i], values[i]),
        })
      }
    }

    const hash = await createProposalCallback(createProposalData)?.catch(() => {
      setAttempting(false)
    })

    if (hash) {
      setHash(hash)
    }
  }

  return (
    <Trace logImpression page={InterfacePageName.VotePage}>
      <PageWrapper>
        <BodyWrapper $maxWidth="800px">
          <Nav to="/vote">
            <BackArrow />
            <HeaderText>
              <Trans i18nKey="vote.landing.createProposal" />
            </HeaderText>
          </Nav>
          <CreateProposalWrapper>
            <BlueCard>
              <AutoColumn gap="10px">
                <ThemedText.DeprecatedLink fontWeight={485} color="accent1">
                  <Trans
                    i18nKey="vote.create.prompt"
                    components={{
                      link: (
                        <ExternalLink
                          key="create-proposal-prompt-link"
                          href="https://docs.rigoblock.com/readme-1/governance/solidity-api#propose"
                        />
                      ),
                    }}
                  />
                </ThemedText.DeprecatedLink>
              </AutoColumn>
            </BlueCard>

            {actions.map((action) => (
              <ActionContainer key={action.id}>
                {actions.length > 1 && <RemoveActionButton onClick={() => handleRemoveAction(action.id)} />}
                <ProposalActionSelector
                  onClick={() => handleActionSelectorClick(action.id)}
                  proposalAction={action.proposalAction}
                />
                <ProposalActionDetail
                  proposalAction={action.proposalAction}
                  currency={action.currency}
                  amount={action.amount}
                  toAddress={action.toAddress}
                  onCurrencySelect={(currency) => handleCurrencySelect(currency, action.id)}
                  onAmountInput={(amount) => handleAmountInput(amount, action.id)}
                  onToAddressInput={(toAddress) => handleToAddressInput(toAddress, action.id)}
                />
              </ActionContainer>
            ))}
            <AddActionButton onClick={handleAddAction}>
              <Trans i18nKey="vote.proposal.addAction" />
            </AddActionButton>
            <ProposalEditor
              title={titleValue}
              body={bodyValue}
              onTitleInput={handleTitleInput}
              onBodyInput={handleBodyInput}
            />
            <CreateProposalButton
              proposalThreshold={proposalThreshold}
              hasActiveOrPendingProposal={false}
              hasEnoughVote={hasEnoughVote}
              isFormInvalid={isFormInvalid}
              handleCreateProposal={handleCreateProposal}
            />
            {!hasEnoughVote ? (
              <AutonomousProposalCTA>
                Don’t have enough votes? Earn GRG tokens by{' '}
                <StyledInternalLink to="/mint">operating a pool</StyledInternalLink>
              </AutonomousProposalCTA>
            ) : null}
          </CreateProposalWrapper>
          <ProposalActionSelectorModal
            isOpen={modalOpen.open}
            onDismiss={handleDismissActionSelector}
            onProposalActionSelect={(proposalAction: ProposalAction) =>
              modalOpen.actionId && handleActionChange(proposalAction, modalOpen.actionId)
            }
          />
          <ProposalSubmissionModal isOpen={attempting} hash={hash} onDismiss={handleDismissSubmissionModal} />
        </BodyWrapper>
      </PageWrapper>
    </Trace>
  )
}

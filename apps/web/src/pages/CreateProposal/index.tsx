import { Interface } from '@ethersproject/abi'
import { getAddress, isAddress } from '@ethersproject/address'
import { InterfacePageName } from '@uniswap/analytics-events'
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
import { ArrowLeft } from 'react-feather'
import { Link } from 'react-router-dom'
import {
  CreateProposalData,
  useCreateProposalCallback,
  useProposalThreshold,
  useUserVotes,
} from 'state/governance/hooks'
import { ThemedText } from 'theme/components'
import { ExternalLink, StyledInternalLink } from 'theme/components/Links'
import AUTHORITY_ABI from 'uniswap/src/abis/authority.json'
import TOKEN_ABI from 'uniswap/src/abis/erc20.json'
import GOVERNANCE_RB_ABI from 'uniswap/src/abis/governance.json'
import RB_POOL_FACTORY_ABI from 'uniswap/src/abis/rb-pool-factory.json'
import STAKING_PROXY_ABI from 'uniswap/src/abis/staking-proxy.json'
import { GRG } from 'uniswap/src/constants/tokens'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { Trans } from 'react-i18next'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

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

export default function CreateProposal() {
  const account = useAccount()

  const { votes: availableVotes } = useUserVotes()
  const proposalThreshold: CurrencyAmount<Token> | undefined = useProposalThreshold()

  const [modalOpen, setModalOpen] = useState(false)
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [proposalAction, setProposalAction] = useState(ProposalAction.UPGRADE_IMPLEMENTATION)
  const [toAddressValue, setToAddressValue] = useState('')
  // TODO: check we are covering all chains
  const [currencyValue, setCurrencyValue] = useState<Currency>(GRG[account.chainId ?? UniverseChainId.Mainnet])
  const [amountValue, setAmountValue] = useState('')
  const [titleValue, setTitleValue] = useState('')
  const [bodyValue, setBodyValue] = useState('')

  const handleActionSelectorClick = useCallback(() => {
    setModalOpen(true)
  }, [setModalOpen])

  const handleActionChange = useCallback(
    (proposalAction: ProposalAction) => {
      setProposalAction(proposalAction)
    },
    [setProposalAction],
  )

  const handleDismissActionSelector = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  const handleDismissSubmissionModal = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
  }, [setHash, setAttempting])

  const handleToAddressInput = useCallback(
    (toAddress: string) => {
      setToAddressValue(toAddress)
    },
    [setToAddressValue],
  )

  const handleCurrencySelect = useCallback(
    (currency: Currency) => {
      setCurrencyValue(currency)
    },
    [setCurrencyValue],
  )

  const handleAmountInput = useCallback(
    (amount: string) => {
      setAmountValue(amount)
    },
    [setAmountValue],
  )

  const handleTitleInput = useCallback(
    (title: string) => {
      setTitleValue(title)
    },
    [setTitleValue],
  )

  const handleBodyInput = useCallback(
    (body: string) => {
      setBodyValue(body)
    },
    [setBodyValue],
  )

  const isFormInvalid = useMemo(
    () =>
      Boolean(
        !proposalAction ||
          !isAddress(toAddressValue) ||
          !currencyValue?.isToken ||
          titleValue === '' ||
          bodyValue === '',
      ),
    [proposalAction, toAddressValue, currencyValue, titleValue, bodyValue],
  )

  const hasEnoughVote = Boolean(
    availableVotes && proposalThreshold && JSBI.greaterThanOrEqual(availableVotes.quotient, proposalThreshold.quotient),
  )

  const createProposalCallback = useCreateProposalCallback()

  const handleCreateProposal = async () => {
    setAttempting(true)

    const createProposalData: CreateProposalData = {} as CreateProposalData

    if (!createProposalCallback || !proposalAction || !currencyValue.isToken) {
      return
    }

    const tokenAmount = tryParseCurrencyAmount(amountValue, currencyValue)
    if (!tokenAmount) {
      return
    }

    createProposalData.description = `# ${titleValue}

${bodyValue}
`

    let values: (string | boolean)[][]
    let methods: string[]
    let targets: string[]
    let interfaces: Interface[]
    // TODO: add all governance owned methods
    switch (proposalAction) {
      case ProposalAction.TRANSFER_TOKEN: {
        if (!tokenAmount) {
          return
        }
        values = [[getAddress(toAddressValue), tokenAmount.quotient.toString()]]
        interfaces = [new Interface(TOKEN_ABI)]
        targets = [currencyValue.address]
        methods = ['transfer']
        break
      }

      case ProposalAction.APPROVE_TOKEN: {
        if (!tokenAmount) {
          return
        }
        values = [[getAddress(toAddressValue), tokenAmount.quotient.toString()]]
        interfaces = [new Interface(TOKEN_ABI)]
        targets = [currencyValue.address]
        methods = ['approve']
        break
      }

      case ProposalAction.UPGRADE_IMPLEMENTATION: {
        values = [[getAddress(toAddressValue)]]
        interfaces = [new Interface(RB_POOL_FACTORY_ABI)]
        targets = [RB_FACTORY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]]
        methods = ['setImplementation']
        break
      }

      case ProposalAction.UPGRADE_GOVERNANCE: {
        values = [[getAddress(toAddressValue)]]
        interfaces = [new Interface(GOVERNANCE_RB_ABI)]
        targets = [GOVERNANCE_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]]
        methods = ['upgradeImplementation']
        break
      }

      case ProposalAction.UPGRADE_STAKING: {
        values = [
          [STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]],
          [],
          [getAddress(toAddressValue)],
          [STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]],
        ]
        interfaces = [new Interface(STAKING_PROXY_ABI)]
        targets = [STAKING_PROXY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]]
        methods = ['addAuthorizedAddress', 'detachStakingContract', 'attachStakingContract', 'removeAuthorizedAddress']
        break
      }

      // any non-empty string for the boolean value will result in adding an adapter
      case ProposalAction.ADD_ADAPTER: {
        values = [[getAddress(toAddressValue), true]]
        interfaces = [new Interface(AUTHORITY_ABI)]
        targets = [AUTHORITY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]]
        methods = ['setAdapter']
        break
      }

      // an empty string for the boolean value will result in removing an adapter
      case ProposalAction.REMOVE_ADAPTER: {
        values = [[getAddress(toAddressValue), false]]
        interfaces = [new Interface(AUTHORITY_ABI)]
        targets = [AUTHORITY_ADDRESSES[account.chainId ?? UniverseChainId.Mainnet]]
        methods = ['setAdapter']
        break
      }
    }

    createProposalData.actions = []
    for (let i = 0; i < values.length; i++) {
      createProposalData.actions[i] = {
        target: targets[0],
        value: 0,
        data: interfaces[0].encodeFunctionData(methods[i], values[i]),
      }
    }

    const hash = await createProposalCallback(createProposalData ?? undefined)?.catch(() => {
      setAttempting(false)
    })

    if (hash) {
      setHash(hash)
    }
  }

  return (
    <Trace logImpression page={InterfacePageName.VOTE_PAGE}>
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

            <ProposalActionSelector onClick={handleActionSelectorClick} proposalAction={proposalAction} />
            <ProposalActionDetail
              proposalAction={proposalAction}
              currency={currencyValue}
              amount={amountValue}
              toAddress={toAddressValue}
              onCurrencySelect={handleCurrencySelect}
              onAmountInput={handleAmountInput}
              onToAddressInput={handleToAddressInput}
            />
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
            isOpen={modalOpen}
            onDismiss={handleDismissActionSelector}
            onProposalActionSelect={(proposalAction: ProposalAction) => handleActionChange(proposalAction)}
          />
          <ProposalSubmissionModal isOpen={attempting} hash={hash} onDismiss={handleDismissSubmissionModal} />
        </BodyWrapper>
      </PageWrapper>
    </Trace>
  )
}

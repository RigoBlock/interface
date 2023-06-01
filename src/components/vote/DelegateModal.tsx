import { isAddress } from '@ethersproject/address'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import JSBI from 'jsbi'
import { ReactNode, /*useCallback,*/ useState } from 'react'
import { X } from 'react-feather'
import styled from 'styled-components/macro'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'

import { GRG_TRANSFER_PROXY_ADDRESSES } from '../../constants/addresses'
//import { isSupportedChain } from '../../constants/chains'
import { GRG } from '../../constants/tokens'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import useDebouncedChangeHandler from '../../hooks/useDebouncedChangeHandler'
import useENS from '../../hooks/useENS'
import { ResponsiveHeaderText, SmallMaxButton } from '../../pages/RemoveLiquidity/styled'
// TODO: check if should write into state stake hooks
import { useBurnV3ActionHandlers, useBurnV3State } from '../../state/burn/v3/hooks'
import { PoolInfo /*,useDerivedPoolInfo*/ } from '../../state/buy/hooks'
import { useTokenBalance } from '../../state/connection/hooks'
import {
  useDelegateCallback,
  useDelegatePoolCallback,
  usePoolExtendedContract,
  usePoolIdByAddress,
} from '../../state/governance/hooks'
import { ThemedText } from '../../theme'
import AddressInputPanel from '../AddressInputPanel'
import { ButtonConfirmed, ButtonPrimary } from '../Button'
//import { ButtonError } from '../Button'
import { LightCard } from '../Card'
import { AutoColumn } from '../Column'
import Modal from '../Modal'
import { LoadingView, SubmittedView } from '../ModalViews'
import { AutoRow, RowBetween } from '../Row'
import Slider from '../Slider'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const TextButton = styled.div`
  :hover {
    cursor: pointer;
  }
`

interface VoteModalProps {
  isOpen: boolean
  poolInfo?: PoolInfo
  onDismiss: () => void
  title: ReactNode
}

export default function DelegateModal({ isOpen, poolInfo, onDismiss, title }: VoteModalProps) {
  const { account, chainId } = useWeb3React()

  // state for delegate input
  const [currencyValue] = useState<Currency>(GRG[chainId ?? 1])
  const [usingDelegate, setUsingDelegate] = useState(false)
  const [typed, setTyped] = useState('')

  function handleRecipientType(val: string) {
    setTyped(val)
  }

  const { percent } = useBurnV3State()
  const { onPercentSelect } = useBurnV3ActionHandlers()

  // monitor for self delegation or input for third part delegate
  // default is self delegation
  const activeDelegate = poolInfo?.pool?.address ?? typed ?? account
  const { address: parsedAddress } = useENS(activeDelegate)

  // TODO: in the context of pool grg balance is balance of pool
  // get the number of votes available to delegate
  const grgUserBalance = useTokenBalance(account ?? undefined, chainId ? GRG[chainId] : undefined)
  const grgPoolBalance = useTokenBalance(parsedAddress ?? undefined, chainId ? GRG[chainId] : undefined)
  const { poolId, stakingPoolExists } = usePoolIdByAddress(parsedAddress ?? undefined)
  // we only pass the pool extended instance if we have to call the pool directly
  const poolContract = usePoolExtendedContract(parsedAddress ?? undefined)
  const grgBalance = usingDelegate ? grgPoolBalance : grgUserBalance

  // boilerplate for the slider
  const [percentForSlider, onPercentSelectForSlider] = useDebouncedChangeHandler(percent, onPercentSelect)
  //CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed))
  const parsedAmount = CurrencyAmount.fromRawAmount(
    currencyValue,
    JSBI.divide(
      JSBI.multiply(grgBalance ? grgBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(percentForSlider)),
      JSBI.BigInt(100)
    )
  )

  const stakeData = {
    amount: parsedAmount?.quotient.toString(),
    pool: parsedAddress,
    poolId,
    poolContract: usingDelegate ? poolContract : undefined,
    stakingPoolExists,
  }

  const delegateUserCallback = useDelegateCallback()
  const delegatePoolCallback = useDelegatePoolCallback()
  const delegateCallback = usingDelegate ? delegatePoolCallback : delegateUserCallback

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [stakeAmount, setStakeAmount] = useState<CurrencyAmount<Currency>>()

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    // if there was a tx hash, we want to clear the input
    if (hash) {
      onPercentSelectForSlider(0)
    }
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onDelegate() {
    setAttempting(true)
    setStakeAmount(parsedAmount)

    // if callback not returned properly ignore
    if (!delegateCallback || !grgBalance || !stakeData || !currencyValue.isToken) return

    // try delegation and store hash
    const hash = await delegateCallback(stakeData ?? undefined)?.catch((error) => {
      setAttempting(false)
      console.log(error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  // usingDelegate equals isRbPool
  const [approval, approveCallback] = useApproveCallback(
    grgBalance ?? undefined,
    GRG_TRANSFER_PROXY_ADDRESSES[chainId ?? 1] ?? undefined,
    usingDelegate
  )

  async function onAttemptToApprove() {
    // TODO: check dep requirements
    if (!approval || !approveCallback) return
    //if (!provider) throw new Error('missing dependencies')
    if (!grgBalance) throw new Error('missing GRG amount')

    await approveCallback()
  }

  return (
    <Modal isOpen={isOpen} onDismiss={wrappedOnDismiss} maxHeight={90}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
              <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
            </RowBetween>
            <ThemedText.DeprecatedBody>
              <Trans>Actively staked GRG tokens represent voting power in Rigoblock governance.</Trans>
            </ThemedText.DeprecatedBody>
            <ThemedText.DeprecatedBody>
              <Trans>By staking GRG to a Rigoblock Pool your activate your voting power. You keep 100% of votes.</Trans>
            </ThemedText.DeprecatedBody>
            <ThemedText.DeprecatedBody>
              <Trans>You may also stake GRG from a Rigoblock Pool operated by yourself.</Trans>
            </ThemedText.DeprecatedBody>
            <ThemedText.DeprecatedBody>
              <Trans>Your voting power will unlock at the beginning of the next Rigoblock epoch.</Trans>
            </ThemedText.DeprecatedBody>
            {/* confirmed={approval === ApprovalState.APPROVED} disabled={approval !== ApprovalState.NOT_APPROVED} */}
            {!usingDelegate && approval !== ApprovalState.APPROVED && (
              <ButtonConfirmed mr="0.5rem" onClick={onAttemptToApprove}>
                <Trans>Approve Staking</Trans>
              </ButtonConfirmed>
            )}
            {!poolInfo && <AddressInputPanel value={typed} onChange={handleRecipientType} />}
            <RowBetween>
              <ResponsiveHeaderText>
                <Trans>{percentForSlider}%</Trans>
              </ResponsiveHeaderText>
              <AutoRow gap="4px" justify="flex-end">
                <SmallMaxButton onClick={() => onPercentSelect(25)} width="20%">
                  <Trans>25%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onClick={() => onPercentSelect(50)} width="20%">
                  <Trans>50%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onClick={() => onPercentSelect(75)} width="20%">
                  <Trans>75%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onClick={() => onPercentSelect(100)} width="20%">
                  <Trans>Max</Trans>
                </SmallMaxButton>
              </AutoRow>
            </RowBetween>
            <Slider value={percentForSlider} onChange={onPercentSelectForSlider} />
            <LightCard>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                    <Trans>Staking {formatCurrencyAmount(parsedAmount, 4)} GRG</Trans>
                  </ThemedText.DeprecatedBody>
                </RowBetween>
              </AutoColumn>
            </LightCard>
            <ButtonPrimary
              disabled={!isAddress(parsedAddress ?? '') || approval !== ApprovalState.APPROVED}
              onClick={onDelegate}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                {usingDelegate ? <Trans>Stake From Pool</Trans> : <Trans>Stake From Wallet</Trans>}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
            <TextButton onClick={() => setUsingDelegate(!usingDelegate)}>
              <ThemedText.DeprecatedBlue>
                {usingDelegate ? <Trans>Stake From Wallet</Trans> : <Trans>Stake From Pool</Trans>}
              </ThemedText.DeprecatedBlue>
            </TextButton>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="md" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              {usingDelegate ? <Trans>Staking From Pool</Trans> : <Trans>Unlocking Votes</Trans>}
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>{formatCurrencyAmount(parsedAmount, 4)}</ThemedText.DeprecatedMain>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash}>
          <AutoColumn gap="md" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Transaction Submitted</Trans>
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>{formatCurrencyAmount(stakeAmount, 4)}</ThemedText.DeprecatedMain>
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

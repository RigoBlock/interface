import { isAddress } from '@ethersproject/address'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { ZERO_ADDRESS } from 'constants/misc'
import { Trans } from 'react-i18next'
import JSBI from 'jsbi'
import { ReactNode, useCallback, useMemo, useState } from 'react'
import { X } from 'react-feather'
import { PoolInfo /*,useDerivedPoolInfo*/ } from 'state/buy/hooks'
import styled from 'lib/styled-components'
import { useAppDispatch } from 'state/hooks'
import { ThemedText } from 'theme/components/text'
import { GRG } from 'uniswap/src/constants/tokens'
import { TransactionStatus } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'

import { useRemoveLiquidityModalContext } from 'components/RemoveLiquidity/RemoveLiquidityModalContext'
import { selectPercent, ResponsiveHeaderText, SmallMaxButton } from 'components/vote/DelegateModal'
import { TextButton } from 'components/vote/DelegateModal'
import useDebouncedChangeHandler from 'hooks/useDebouncedChangeHandler'
import { useENS } from 'uniswap/src/features/ens/useENS'
import {
  StakeData,
  useDeactivateStakeCallback,
  useMoveStakeCallback,
  usePoolExtendedContract,
  usePoolIdByAddress,
  useStakeBalance,
} from 'state/governance/hooks'
import { useFreeStakeBalance } from 'state/stake/hooks'
import { useIsTransactionConfirmed, useTransaction } from 'state/transactions/hooks'
import AddressInputPanel from 'components/AddressInputPanel'
import { /*ButtonConfirmed,*/ ButtonPrimary } from 'components/Button/buttons'
//import { ButtonError } from '../Button'
import { LightCard } from 'components/Card/cards'
import { AutoColumn } from 'components/deprecated/Column'
import { AutoRow, RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import Slider from 'components/Slider'
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

interface MoveStakeModalProps {
  isOpen: boolean
  poolInfo: PoolInfo
  isDeactivate?: boolean
  onDismiss: () => void
  title: ReactNode
}

export default function MoveStakeModal({ isOpen, poolInfo, isDeactivate, onDismiss, title }: MoveStakeModalProps) {
  const account = useAccount()

  // state for delegate input
  const [currencyValue] = useState<Currency>(GRG[account.chainId ?? UniverseChainId.Mainnet])
  const [typed, setTyped] = useState('')
  const [isPoolMoving, setIsPoolMoving] = useState(false)

  function handleFromPoolType(val: string) {
    setTyped(val)
  }

  const { percent } = useRemoveLiquidityModalContext()
    const dispatch = useAppDispatch()
    const onPercentSelect = useCallback(
      (percent: number) => {
        dispatch(selectPercent({ percent }))
      },
      [dispatch],
    )

  const fromPoolAddress = typed ?? ZERO_ADDRESS
  const { address: parsedAddress } = useENS({ nameOrAddress: fromPoolAddress })

  // TODO: we can save 1 rpc call here by using multicall
  const fromPoolId = usePoolIdByAddress(parsedAddress ?? undefined).poolId
  const { poolId, stakingPoolExists } = usePoolIdByAddress(poolInfo.pool?.address)
  const fromPoolStakeBalance = useStakeBalance(
    isDeactivate ? poolId : fromPoolId,
    isPoolMoving ? poolInfo?.pool?.address : undefined
  )
  const freeStakeBalance = useFreeStakeBalance(true)
  const poolContract = usePoolExtendedContract(poolInfo?.pool?.address)

  // boilerplate for the slider
  const [percentForSlider, onPercentSelectForSlider] = useDebouncedChangeHandler(Number(percent), onPercentSelect)
  //CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed))
  const parsedAmount = CurrencyAmount.fromRawAmount(
    currencyValue,
    JSBI.divide(
      JSBI.multiply(
        fromPoolStakeBalance
          ? fromPoolStakeBalance.quotient
          : freeStakeBalance
          ? freeStakeBalance.quotient
          : JSBI.BigInt(0),
        JSBI.BigInt(percentForSlider)
      ),
      JSBI.BigInt(100)
    )
  )
  const newApr = useMemo(() => {
    if (poolInfo?.apr?.toString() !== 'NaN') {
      const aprImpact =
        Number(poolInfo?.poolStake) / (Number(poolInfo?.poolStake) + Number(parsedAmount?.quotient.toString()) / 1e18)
      return (Number(poolInfo?.apr) * aprImpact).toFixed(2)
    } else {
      return undefined
    }
  }, [poolInfo, parsedAmount])

  const moveStakeData: StakeData = {
    amount: parsedAmount?.quotient.toString(),
    pool: poolInfo.pool?.address,
    fromPoolId: fromPoolId ?? poolId,
    poolId: poolId ?? '',
    poolContract: isPoolMoving ? poolContract : null,
    stakingPoolExists,
    isPoolMoving,
  }

  const moveStakeCallback = useMoveStakeCallback()
  const deactivateStakeCallback = useDeactivateStakeCallback()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [stakeAmount, setStakeAmount] = useState<CurrencyAmount<Currency>>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Confirmed

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

  async function onMoveStake() {
    setAttempting(true)
    setStakeAmount(parsedAmount)

    // if callback not returned properly ignore
    if (
      !moveStakeCallback ||
      !deactivateStakeCallback ||
      (!fromPoolStakeBalance && !freeStakeBalance) ||
      !currencyValue.isToken
    ) {
      return
    }

    const moveCallback = !isDeactivate ? moveStakeCallback : deactivateStakeCallback

    // try delegation and store hash
    const hash = await moveCallback(moveStakeData)?.catch((error) => {
      setAttempting(false)
      logger.info('MoveStakeModal', 'onMoveStake', error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={600}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
              <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
            </RowBetween>
            {!isDeactivate && (
              <>
                <ThemedText.DeprecatedBody>
                  <Trans>Move stake to the pools that maximize your APR, Your voting power will be unaffected.</Trans>
                </ThemedText.DeprecatedBody>
                <ThemedText.DeprecatedBody>
                  <Trans>Input the pool you want to move your stake from, or leave blank to activate free stake.</Trans>
                </ThemedText.DeprecatedBody>
                <AddressInputPanel value={typed} onChange={handleFromPoolType} />
              </>
            )}
            <RowBetween>
              <ResponsiveHeaderText>
                <Trans>{{percentForSlider}}%</Trans>
              </ResponsiveHeaderText>
              <AutoRow gap="4px" justify="flex-end">
                <SmallMaxButton onPress={() => onPercentSelect(25)}>
                  <Trans>25%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onPress={() => onPercentSelect(50)}>
                  <Trans>50%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onPress={() => onPercentSelect(75)}>
                  <Trans>75%</Trans>
                </SmallMaxButton>
                <SmallMaxButton onPress={() => onPercentSelect(100)}>
                  <Trans>Max</Trans>
                </SmallMaxButton>
              </AutoRow>
            </RowBetween>
            <Slider value={percentForSlider} onChange={onPercentSelectForSlider} />
            <LightCard>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                    {!isDeactivate ? <Trans>Moving</Trans> : <Trans>Deactivating</Trans>}{' '}
                    <Trans>{formatCurrencyAmount(parsedAmount, 4)} GRG Stake</Trans>
                  </ThemedText.DeprecatedBody>
                  {newApr && !isDeactivate && (
                    <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                      <Trans>APR {newApr}%</Trans>
                    </ThemedText.DeprecatedBody>
                  )}
                </RowBetween>
              </AutoColumn>
            </LightCard>
            <ButtonPrimary
              disabled={
                formatCurrencyAmount(parsedAmount, 4) === '0' || (typed !== '' && !isAddress(parsedAddress ?? ''))
              }
              onClick={onMoveStake}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                {!isDeactivate ? (
                  <Trans>Move Stake</Trans>
                ) : !isPoolMoving ? (
                  <Trans>Deactivate Stake</Trans>
                ) : (
                  <Trans>Deactivate Pool Stake</Trans>
                )}{' '}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
            {isDeactivate && poolInfo?.owner === account.address && (
              <TextButton onClick={() => setIsPoolMoving(!isPoolMoving)}>
                <ThemedText.DeprecatedMediumHeader>
                  {isPoolMoving ? <Trans>Deactivate Stake</Trans> : <Trans>Deactivate Pool Stake</Trans>}
                </ThemedText.DeprecatedMediumHeader>
              </TextButton>
            )}
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              {!isDeactivate ? (
                <Trans>Moving Stake</Trans>
              ) : isPoolMoving ? (
                <Trans>Deactivating Pool Stake</Trans>
              ) : (
                <Trans>Deactivating Stake</Trans>
              )}{' '}
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>
              {formatCurrencyAmount(parsedAmount, 4)} GRG
            </ThemedText.DeprecatedMain>
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
                <ThemedText.DeprecatedMain fontSize={36}>
                  Moving {formatCurrencyAmount(stakeAmount, 4)} GRG
                </ThemedText.DeprecatedMain>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedMain fontSize={36}>
                  Moved {formatCurrencyAmount(stakeAmount, 4)} GRG
                </ThemedText.DeprecatedMain>
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

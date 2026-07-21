import { isAddress } from '@ethersproject/address'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { ReactNode, useCallback, useMemo, useState } from 'react'
import { X } from 'react-feather'
import { Trans, useTranslation } from 'react-i18next'
import { Flex, useSporeColors } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useENS } from 'uniswap/src/features/ens/useENS'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import AddressInputPanel from '~/components/AddressInputPanel'
import { /*ButtonConfirmed,*/ ButtonPrimary } from '~/components/Button/buttons'
//import { ButtonError } from '../Button'
import { LightCard } from '~/components/Card/cards'
import { AutoColumn } from '~/components/deprecated/Column'
import { RowBetween } from '~/components/deprecated/Row'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import Slider from '~/components/Slider'
import { ResponsiveHeaderText, TextButton } from '~/components/vote/DelegateModal'
import { useAccount } from '~/hooks/useAccount'
import useDebouncedChangeHandler from '~/hooks/useDebouncedChangeHandler'
import styled from '~/lib/deprecated-styled'
import { useRemoveLiquidityModalContext } from '~/pages/RemoveLiquidity/RemoveLiquidityModalContext'
import { ClickablePill } from '~/pages/Swap/Buy/PredefinedAmount'
import { PoolInfo /*,useDerivedPoolInfo*/ } from '~/state/buy/hooks'
import {
  StakeData,
  useDeactivateStakeCallback,
  useMoveStakeCallback,
  usePoolIdByAddress,
  useStakeBalance,
} from '~/state/governance/hooks'
import { usePoolExtendedContract } from '~/state/pool/hooks'
import { useFreeStakeBalance } from '~/state/stake/hooks'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'
import { ThemedText } from '~/theme/components/text'

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

interface ParsedMoveAmountParams {
  currencyValue: Currency
  fromPoolStakeBalance: CurrencyAmount<Currency> | undefined
  freeStakeBalance: CurrencyAmount<Currency> | undefined
  percentForSlider: number
}

function useParsedMoveAmount({
  currencyValue,
  fromPoolStakeBalance,
  freeStakeBalance,
  percentForSlider,
}: ParsedMoveAmountParams): CurrencyAmount<Currency> {
  return useMemo(
    () =>
      CurrencyAmount.fromRawAmount(
        currencyValue,
        JSBI.divide(
          JSBI.multiply(
            fromPoolStakeBalance
              ? fromPoolStakeBalance.quotient
              : freeStakeBalance
                ? freeStakeBalance.quotient
                : JSBI.BigInt(0),
            JSBI.BigInt(percentForSlider),
          ),
          JSBI.BigInt(100),
        ),
      ),
    [currencyValue, freeStakeBalance, fromPoolStakeBalance, percentForSlider],
  )
}

function MoveButtonLabel({ isDeactivate, isPoolMoving }: { isDeactivate?: boolean; isPoolMoving: boolean }): JSX.Element {
  return !isDeactivate ? (
    <Trans>Move Stake</Trans>
  ) : !isPoolMoving ? (
    <Trans>Deactivate Stake</Trans>
  ) : (
    <Trans>Deactivate Pool Stake</Trans>
  )
}

function MovePendingTitle({ isDeactivate, isPoolMoving }: { isDeactivate?: boolean; isPoolMoving: boolean }): JSX.Element {
  return !isDeactivate ? (
    <Trans>Moving Stake</Trans>
  ) : isPoolMoving ? (
    <Trans>Deactivating Pool Stake</Trans>
  ) : (
    <Trans>Deactivating Stake</Trans>
  )
}

function MoveSubmittedContent({
  confirmed,
  transactionSuccess,
  stakeAmount,
  formatCurrencyAmount,
}: {
  confirmed: boolean
  transactionSuccess: boolean
  stakeAmount: CurrencyAmount<Currency> | undefined
  formatCurrencyAmount: (args: { value: CurrencyAmount<Currency> | undefined }) => string
}): JSX.Element {
  if (!confirmed) {
    return (
      <>
        <ThemedText.DeprecatedLargeHeader>
          <Trans>Transaction Submitted</Trans>
        </ThemedText.DeprecatedLargeHeader>
        <ThemedText.DeprecatedMain fontSize={36}>
          Moving {formatCurrencyAmount({ value: stakeAmount })} GRG
        </ThemedText.DeprecatedMain>
      </>
    )
  }
  if (transactionSuccess) {
    return (
      <>
        <ThemedText.DeprecatedLargeHeader>
          <Trans>Transaction Success</Trans>
        </ThemedText.DeprecatedLargeHeader>
        <ThemedText.DeprecatedMain fontSize={36}>
          Moved {formatCurrencyAmount({ value: stakeAmount })} GRG
        </ThemedText.DeprecatedMain>
      </>
    )
  }
  return (
    <ThemedText.DeprecatedLargeHeader>
      <Trans>Transaction Failed</Trans>
    </ThemedText.DeprecatedLargeHeader>
  )
}

export default function MoveStakeModal({ isOpen, poolInfo, isDeactivate, onDismiss, title }: MoveStakeModalProps) {
  const account = useAccount()
  const { t } = useTranslation()
  const colors = useSporeColors()
  const { formatCurrencyAmount } = useLocalizationContext()

  // state for delegate input
  const [currencyValue] = useState<Currency>(GRG[account.chainId ?? UniverseChainId.Mainnet])
  const [typed, setTyped] = useState('')
  const [isPoolMoving, setIsPoolMoving] = useState(false)

  const handleFromPoolType = useCallback((val: string) => {
    setTyped(val)
  }, [])

  const { percent, setPercent } = useRemoveLiquidityModalContext()
  const onPercentSelect = useCallback(
    (value: number) => {
      setPercent(value.toString())
    },
    [setPercent],
  )

  const fromPoolAddress = typed === '' ? ZERO_ADDRESS : typed
  const { address: parsedAddress } = useENS({ nameOrAddress: fromPoolAddress })

  // TODO: we can save 1 rpc call here by using multicall
  const fromPoolId = usePoolIdByAddress(parsedAddress ?? undefined).poolId
  const { poolId, stakingPoolExists } = usePoolIdByAddress(poolInfo.pool.address)
  const fromPoolStakeBalance = useStakeBalance(
    isDeactivate ? poolId : fromPoolId,
    isPoolMoving ? poolInfo.pool.address : undefined,
  )
  const freeStakeBalance = useFreeStakeBalance(true)
  const poolContract = usePoolExtendedContract(poolInfo.pool.address)

  // boilerplate for the slider
  const [percentForSlider, onPercentSelectForSlider] = useDebouncedChangeHandler(Number(percent), onPercentSelect)
  const parsedAmount = useParsedMoveAmount({
    currencyValue,
    fromPoolStakeBalance,
    freeStakeBalance,
    percentForSlider,
  })

  const newApr = useMemo(() => {
    if (poolInfo.apr?.toString() !== 'NaN') {
      const aprImpact =
        Number(poolInfo.poolStake) / (Number(poolInfo.poolStake) + Number(parsedAmount.quotient.toString()) / 1e18)
      return (Number(poolInfo.apr) * aprImpact).toFixed(2)
    }
    return undefined
  }, [poolInfo, parsedAmount])

  const moveStakeData: StakeData = useMemo(
    () => ({
      amount: parsedAmount.quotient.toString(),
      pool: poolInfo.pool.address,
      fromPoolId: fromPoolId ?? poolId,
      poolId: poolId ?? '',
      poolContract: isPoolMoving ? poolContract : null,
      stakingPoolExists,
      isPoolMoving,
    }),
    [parsedAmount, poolInfo.pool.address, fromPoolId, poolId, isPoolMoving, poolContract, stakingPoolExists],
  )

  const moveStakeCallback = useMoveStakeCallback()
  const deactivateStakeCallback = useDeactivateStakeCallback()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [stakeAmount, setStakeAmount] = useState<CurrencyAmount<Currency>>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  // wrapper to reset state on modal close
  const wrappedOnDismiss = useCallback(() => {
    // if there was a tx hash, we want to clear the input
    if (hash) {
      onPercentSelectForSlider(0)
    }
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }, [hash, onDismiss, onPercentSelectForSlider])

  const onMoveStake = useCallback(async () => {
    setAttempting(true)
    setStakeAmount(parsedAmount)

    // if callback not returned properly ignore
    if (
      (!fromPoolStakeBalance && !freeStakeBalance) ||
      !currencyValue.isToken ||
      JSBI.equal(parsedAmount.quotient, JSBI.BigInt(0))
    ) {
      return
    }

    const moveCallback = !isDeactivate ? moveStakeCallback : deactivateStakeCallback

    // try delegation and store hash
    const txHash = await moveCallback(moveStakeData)?.catch((error) => {
      setAttempting(false)
      logger.info('MoveStakeModal', 'onMoveStake', error)
    })

    if (txHash) {
      setHash(txHash)
    }
  }, [
    currencyValue.isToken,
    deactivateStakeCallback,
    freeStakeBalance,
    fromPoolStakeBalance,
    isDeactivate,
    moveStakeCallback,
    moveStakeData,
    parsedAmount,
  ])

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
              <ResponsiveHeaderText>{percentForSlider}%</ResponsiveHeaderText>
              <Flex row gap="$gap8" width="100%" justifyContent="center">
                {[25, 50, 75, 100].map((option) => {
                  const active = percent === option.toString()
                  return (
                    <ClickablePill
                      key={option}
                      onPress={() => {
                        onPercentSelectForSlider(option)
                      }}
                      $disabled={false}
                      $active={active}
                      customBorderColor={colors.surface3.val}
                      foregroundColor={colors[active ? 'neutral1' : 'neutral2'].val}
                      label={option < 100 ? option + '%' : t('swap.button.max')}
                      px="$spacing16"
                      textVariant="buttonLabel2"
                    />
                  )
                })}
              </Flex>
            </RowBetween>
            <Slider value={percentForSlider} onChange={onPercentSelectForSlider} />
            <LightCard>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                    {!isDeactivate ? <Trans>Moving</Trans> : <Trans>Deactivating</Trans>}{' '}
                    <Trans
                      i18nKey="earn.moveStake.stakeAmount"
                      values={{ amount: formatCurrencyAmount({ value: parsedAmount }) }}
                      defaults="{{amount}} GRG Stake"
                    />
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
                formatCurrencyAmount({ value: parsedAmount }) === '0' ||
                (typed !== '' && !isAddress(parsedAddress ?? ''))
              }
              onClick={onMoveStake}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                <MoveButtonLabel isDeactivate={isDeactivate} isPoolMoving={isPoolMoving} />{' '}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
            {isDeactivate && poolInfo.owner === account.address && (
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
              <MovePendingTitle isDeactivate={isDeactivate} isPoolMoving={isPoolMoving} />{' '}
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>
              {formatCurrencyAmount({ value: parsedAmount })} GRG
            </ThemedText.DeprecatedMain>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          <AutoColumn gap="12px" justify="center">
            <MoveSubmittedContent
              confirmed={confirmed}
              transactionSuccess={transactionSuccess}
              stakeAmount={stakeAmount}
              formatCurrencyAmount={formatCurrencyAmount}
            />
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

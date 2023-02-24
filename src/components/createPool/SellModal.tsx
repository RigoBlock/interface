import type { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount /*, Token*/ } from '@uniswap/sdk-core'
//import { useWeb3React } from '@web3-react/core'
import JSBI from 'jsbi'
import { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components/macro'

import { PoolInfo, useDerivedPoolInfo } from '../../state/buy/hooks'
import { usePoolExtendedContract } from '../../state/pool/hooks'
import { useTransactionAdder } from '../../state/transactions/hooks'
import { TransactionType } from '../../state/transactions/types'
import { CloseIcon, ThemedText } from '../../theme'
import { calculateGasMargin } from '../../utils/calculateGasMargin'
import { formatCurrencyAmount } from '../../utils/formatCurrencyAmount'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { /*ButtonConfirmed,*/ ButtonError } from '../Button'
import { AutoColumn } from '../Column'
import CurrencyInputPanel from '../CurrencyInputPanel'
import Modal from '../Modal'
import { LoadingView, SubmittedView } from '../ModalViews'
import ProgressCircles from '../ProgressSteps'
import { RowBetween } from '../Row'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 1rem;
`

interface PoolModalProps {
  isOpen: boolean
  onDismiss: () => void
  poolInfo?: PoolInfo
  userBaseTokenBalance?: CurrencyAmount<Currency> | undefined
}

export default function SellModal({ isOpen, onDismiss, poolInfo, userBaseTokenBalance }: PoolModalProps) {
  //const { provider } = useWeb3React()

  // track and parse user input
  const [typedValue, setTypedValue] = useState('')

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()
  const [attempting, setAttempting] = useState<boolean>(false)
  const [hash, setHash] = useState<string | undefined>()
  const wrappedOnDismiss = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }, [onDismiss])

  // TODO: check if needed to send also currency as input to hook
  const { parsedAmount, error } = useDerivedPoolInfo(
    typedValue,
    poolInfo?.userPoolBalance?.currency,
    poolInfo?.userPoolBalance
  )

  const poolContract = usePoolExtendedContract(poolInfo?.pool?.address)

  const { expectedBaseTokens, minimumAmount } = useMemo(() => {
    if (!parsedAmount || !poolInfo) {
      return {
        expectedBaseTokens: undefined,
        minimumAmount: undefined,
      }
    }

    // price plus spread
    const baseTokenAmount = JSBI.divide(
      JSBI.multiply(
        JSBI.subtract(parsedAmount.quotient, JSBI.divide(parsedAmount.quotient, JSBI.BigInt(20))),
        poolInfo.poolPriceAmount.quotient
      ),
      JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(parsedAmount.currency.decimals ?? 18))
    )
    // extra 2% margin
    const minimumAmount = JSBI.subtract(baseTokenAmount, JSBI.divide(baseTokenAmount, JSBI.BigInt(50)))
    // TODO: we use pool currency instead of base currency as same decimals, double check if changed
    return {
      expectedBaseTokens: CurrencyAmount.fromRawAmount(parsedAmount.currency, baseTokenAmount),
      minimumAmount: CurrencyAmount.fromRawAmount(parsedAmount.currency, minimumAmount),
    }
  }, [parsedAmount, poolInfo])

  async function onSell() {
    setAttempting(true)
    if (poolContract && parsedAmount && poolInfo /*&& deadline*/) {
      const args = [parsedAmount.quotient.toString(), minimumAmount?.quotient.toString()]

      // mint method not unique in interface
      return poolContract.estimateGas['burn(uint256,uint256)'](...args, {}).then((estimatedGasLimit) => {
        return poolContract['burn(uint256,uint256)'](...args, {
          value: null,
          gasLimit: calculateGasMargin(estimatedGasLimit),
        }).then((response: TransactionResponse) => {
          addTransaction(response, {
            // TODO: define correct transaction type
            type: TransactionType.DELEGATE,
            delegatee: poolInfo.recipient,
          })
          setHash(response.hash)
          return response.hash
        })
      })
    }
  }

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback((typedValue: string) => {
    setTypedValue(typedValue)
  }, [])

  // used for max input button
  //const maxAmountInput = maxAmountSpend(userLiquidityUnstaked)
  const maxAmountInput = maxAmountSpend(userBaseTokenBalance)
  const atMaxAmount = Boolean(maxAmountInput && parsedAmount?.equalTo(maxAmountInput))
  const handleMax = useCallback(() => {
    maxAmountInput && onUserInput(maxAmountInput.toExact())
  }, [maxAmountInput, onUserInput])

  return (
    <Modal isOpen={isOpen} onDismiss={wrappedOnDismiss} maxHeight={90}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          {/* TODO: check handling of user with null base token balance */}
          {userBaseTokenBalance && poolInfo && (
            <>
              <RowBetween>
                <ThemedText.DeprecatedMediumHeader>
                  <Trans>
                    Sell {poolInfo.pool?.symbol ?? null} Receive {userBaseTokenBalance.currency?.symbol}
                  </Trans>
                </ThemedText.DeprecatedMediumHeader>
                <CloseIcon onClick={wrappedOnDismiss} />
              </RowBetween>
              <CurrencyInputPanel
                value={typedValue}
                onUserInput={onUserInput}
                onMax={handleMax}
                showMaxButton={!atMaxAmount}
                currency={poolInfo.poolPriceAmount.currency}
                label=""
                renderBalance={(amount) => <Trans>Available to withdraw: {formatCurrencyAmount(amount, 4)}</Trans>}
                id="buy-pool-tokens"
              />
            </>
          )}

          <RowBetween>
            <ButtonError disabled={!!error} error={!!error && !!parsedAmount} onClick={onSell}>
              {error ?? <Trans>Sell</Trans>}
            </ButtonError>
          </RowBetween>
          {/* TODO: check these circles */}
          <ProgressCircles steps={[typedValue !== undefined]} disabled={true} />
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Selling</Trans>
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedBody fontSize={20}>
              <Trans>
                {parsedAmount?.toSignificant(4)} {poolInfo?.pool.symbol}
              </Trans>
            </ThemedText.DeprecatedBody>
            <ThemedText.DeprecatedBody fontSize={20}>
              <Trans>
                Expected {expectedBaseTokens?.toSignificant(4)} {userBaseTokenBalance?.currency?.symbol}
              </Trans>
            </ThemedText.DeprecatedBody>
          </AutoColumn>
        </LoadingView>
      )}
      {attempting && hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Transaction Submitted</Trans>
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedBody fontSize={20}>
              <Trans>
                Sold {parsedAmount?.toSignificant(4)} {poolInfo?.pool.symbol}
              </Trans>
            </ThemedText.DeprecatedBody>
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

import type { TransactionResponse } from '@ethersproject/providers'
import { Currency, CurrencyAmount /*, Token*/ } from '@uniswap/sdk-core'
//import { useWeb3React } from '@web3-react/core'
import { Trans } from 'react-i18next'
import JSBI from 'jsbi'
import { useCallback, useMemo, useState } from 'react'
import styled from 'lib/styled-components'
import { ThemedText } from 'theme/components'
import { ModalCloseIcon } from 'ui/src'
import { TransactionStatus } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'

import { PoolInfo, useDerivedPoolInfo } from 'state/buy/hooks'
import { usePoolExtendedContract } from 'state/pool/hooks'
import { useIsTransactionConfirmed, useTransaction, useTransactionAdder } from 'state/transactions/hooks'
import { TransactionType } from 'state/transactions/types'
import { calculateGasMargin } from 'utils/calculateGasMargin'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { maxAmountSpend } from 'utils/maxAmountSpend'
import { /*ButtonConfirmed,*/ ButtonError } from 'components/Button/buttons'
import CurrencyInputPanel from 'components/CurrencyInputPanel'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName} from 'uniswap/src/features/telemetry/constants'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import ProgressCircles from 'components/ProgressSteps'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 1rem;
`

interface PoolModalProps {
  isOpen: boolean
  onDismiss: () => void
  poolInfo?: PoolInfo
  userBaseTokenBalance?: CurrencyAmount<Currency>
  poolBaseTokenBalance?: CurrencyAmount<Currency>
}

export default function SellModal({
  isOpen,
  onDismiss,
  poolInfo,
  userBaseTokenBalance,
  poolBaseTokenBalance,
}: PoolModalProps) {
  //const { provider } = useWeb3React()

  // track and parse user input
  const [typedValue, setTypedValue] = useState('')

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()
  const [attempting, setAttempting] = useState<boolean>(false)
  const [hash, setHash] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Confirmed

  const wrappedOnDismiss = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }, [onDismiss])

  const { parsedAmount, error } = useDerivedPoolInfo(
    typedValue,
    poolInfo?.userPoolBalance?.currency,
    poolInfo?.userPoolBalance,
    poolInfo?.activation
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
        JSBI.subtract(
          parsedAmount.quotient,
          JSBI.divide(JSBI.multiply(parsedAmount.quotient, JSBI.BigInt(poolInfo.spread)), JSBI.BigInt(10000))
        ),
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

  // it is possible that user is requesting more that its balance
  const poolHoldsEnough: boolean = useMemo(() => {
    if (!poolBaseTokenBalance || !expectedBaseTokens || !parsedAmount || !poolInfo) {
      return true
    }
    if (JSBI.greaterThanOrEqual(parsedAmount.quotient, poolInfo?.userPoolBalance.quotient)) {
      return false
    }
    return JSBI.greaterThanOrEqual(poolBaseTokenBalance.quotient, expectedBaseTokens.quotient)
  }, [poolBaseTokenBalance, expectedBaseTokens, parsedAmount, poolInfo])

  async function onSell(): Promise<void | undefined> {
    setAttempting(true)
    if (poolContract && parsedAmount && poolInfo /*&& deadline*/) {
      const args = [parsedAmount.quotient.toString(), minimumAmount?.quotient.toString()]

      // mint method not unique in interface
      return poolContract.estimateGas['burn(uint256,uint256)'](...args, {}).then((estimatedGasLimit) => {
        return poolContract['burn(uint256,uint256)'](...args, {
          value: null,
          gasLimit: calculateGasMargin(estimatedGasLimit),
        })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.SELL,
            })
            setAttempting(false)
            setHash(response.hash)
            return response.hash
          })
          .catch(() => {
            setAttempting(false)
          })
      })
    } else {
      return undefined
    }
  }

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback((typedValue: string) => {
    setTypedValue(typedValue)
  }, [])

  // used for max input button
  const maxAmountInput = maxAmountSpend(poolInfo?.userPoolBalance)
  const atMaxAmount = Boolean(maxAmountInput && parsedAmount?.equalTo(maxAmountInput))
  const handleMax = useCallback(() => {
    maxAmountInput && onUserInput(maxAmountInput.toExact())
  }, [maxAmountInput, onUserInput])

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={480}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          {userBaseTokenBalance && poolInfo && (
            <>
              <RowBetween>
                <ThemedText.DeprecatedMediumHeader>
                  <Trans>
                    Sell {poolInfo.pool?.symbol ?? null} Receive {userBaseTokenBalance.currency?.symbol}
                  </Trans>
                </ThemedText.DeprecatedMediumHeader>
                <ModalCloseIcon onClose={wrappedOnDismiss} />
              </RowBetween>
              <CurrencyInputPanel
                value={typedValue}
                onUserInput={onUserInput}
                onMax={handleMax}
                showMaxButton={!atMaxAmount}
                currency={poolInfo.poolPriceAmount?.currency ?? null}
                isAccount={true}
                label=""
                renderBalance={(amount) => <Trans>Available to withdraw: {formatCurrencyAmount(amount, 4)}</Trans>}
                id="buy-pool-tokens"
              />
            </>
          )}

          <RowBetween>
            <ButtonError
              disabled={!!error || !poolHoldsEnough}
              error={(!!error || !poolHoldsEnough) && !!parsedAmount}
              onClick={onSell}
            >
              {error ??
                (!poolHoldsEnough ? (
                  <Trans>Pool does not hold enough {userBaseTokenBalance?.currency?.symbol}</Trans>
                ) : (
                  <Trans>Sell</Trans>
                ))}
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
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          <AutoColumn gap="12px" justify="center">
            {!confirmed ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Submitted</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>
                    Selling {parsedAmount?.toSignificant(4)} {poolInfo?.pool.symbol}
                  </Trans>
                </ThemedText.DeprecatedBody>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedBody fontSize={20}>
                  <Trans>
                    Sold {parsedAmount?.toSignificant(4)} {poolInfo?.pool.symbol}
                  </Trans>
                </ThemedText.DeprecatedBody>
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

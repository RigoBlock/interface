import type { TransactionResponse } from '@ethersproject/providers'
import { Currency, CurrencyAmount /*, Token*/ } from '@uniswap/sdk-core'
import { /*ButtonConfirmed,*/ ButtonError } from 'components/Button/buttons'
import CurrencyInputPanel from 'components/CurrencyInputPanel'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import { LoadingView, SubmittedView } from 'components/ModalViews'
import ProgressCircles from 'components/ProgressSteps'
import JSBI from 'jsbi'
import styled from 'lib/styled-components'
import { useCallback, useEffect, useMemo, useState } from 'react'
//import { useWeb3React } from '@web3-react/core'
import { Trans } from 'react-i18next'
import { PoolInfo, useDerivedPoolInfo } from 'state/buy/hooks'
import { usePoolExtendedContract } from 'state/pool/hooks'
import { useIsTransactionConfirmed, useTransaction, useTransactionAdder } from 'state/transactions/hooks'
import { ThemedText } from 'theme/components'
import { ModalCloseIcon } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus, TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { calculateGasMargin } from 'utils/calculateGasMargin'
import { maxAmountSpend } from 'utils/maxAmountSpend'

const burnAmountCache = new Map()

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
  const { formatCurrencyAmount } = useLocalizationContext()
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const wrappedOnDismiss = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }, [onDismiss])

  const { parsedAmount, error } = useDerivedPoolInfo(
    typedValue,
    poolInfo?.userPoolBalance?.currency,
    poolInfo?.userPoolBalance,
    poolInfo?.activation,
  )

  const poolContract = usePoolExtendedContract(poolInfo?.pool?.address)
  const [expectedBurnOutputAmount, setExpectedBurnOutputAmount] = useState<any>(undefined)

  useEffect(() => {
    async function retrieveBurnOutputAmount() {
      if (!poolContract || !poolInfo?.recipient || !parsedAmount?.quotient) {
        return
      }

      // TODO: handle error if contract call fails
      const args = [parsedAmount.quotient.toString(), 1]
      let burnOutputAmount
      try {
        const cacheKey = JSON.stringify(args)
        if (burnAmountCache.has(cacheKey)) {
          burnOutputAmount = burnAmountCache.get(cacheKey)
        } else {
          burnOutputAmount = await poolContract.callStatic['burn(uint256,uint256)'](...args)
          burnAmountCache.set(cacheKey, burnOutputAmount)
        }
      } catch (error) {
        setExpectedBurnOutputAmount(undefined)
        return
      }
      setExpectedBurnOutputAmount(burnOutputAmount)
    }
    retrieveBurnOutputAmount()
  }, [poolContract, poolInfo?.recipient, parsedAmount?.quotient])

  const { expectedBaseTokens, minimumAmount } = useMemo(() => {
    if (!parsedAmount || !poolInfo) {
      return {
        expectedBaseTokens: undefined,
        minimumAmount: undefined,
      }
    }
    const burnValue = expectedBurnOutputAmount !== undefined ? expectedBurnOutputAmount : '0'
    const burnJSBI = JSBI.BigInt(burnValue.toString())
    const minJSBI = JSBI.subtract(burnJSBI, JSBI.divide(burnJSBI, JSBI.BigInt(10)))
    // extra 10% margin applied; if burn output is 0, corresponding amounts will also be 0
    return {
      expectedBaseTokens: CurrencyAmount.fromRawAmount(parsedAmount.currency, burnJSBI.toString()),
      minimumAmount: CurrencyAmount.fromRawAmount(parsedAmount.currency, minJSBI.toString()),
    }
  }, [expectedBurnOutputAmount, parsedAmount, poolInfo])

  // it is possible that user is requesting more that its balance
  const poolHoldsEnough: boolean = useMemo(() => {
    if (!poolBaseTokenBalance || !expectedBaseTokens || !poolInfo) {
      return true
    }
    return (
      !JSBI.equal(expectedBaseTokens.quotient, JSBI.BigInt(0)) &&
      JSBI.greaterThanOrEqual(poolBaseTokenBalance.quotient, expectedBaseTokens.quotient)
    )
  }, [poolBaseTokenBalance, expectedBaseTokens, poolInfo])

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
              type: TransactionType.Sell,
              vaultAddress: poolInfo.pool.address,
              saleCurrencyAmountRaw: parsedAmount.quotient.toString(),
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
                    Sell {poolInfo.pool.symbol ?? null} Receive {userBaseTokenBalance.currency.symbol}
                  </Trans>
                </ThemedText.DeprecatedMediumHeader>
                <ModalCloseIcon onClose={wrappedOnDismiss} />
              </RowBetween>
              <CurrencyInputPanel
                value={typedValue}
                onUserInput={onUserInput}
                onMax={handleMax}
                showMaxButton={!atMaxAmount}
                currency={poolInfo.poolPriceAmount.currency}
                isAccount={true}
                label=""
                renderBalance={(amount) => (
                  <Trans>Available to withdraw: {formatCurrencyAmount({ value: amount })}</Trans>
                )}
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
                  <Trans>Pool does not hold enough {userBaseTokenBalance?.currency.symbol}</Trans>
                ) : (
                  <Trans>Sell</Trans>
                ))}
            </ButtonError>
          </RowBetween>
          {/* TODO: check these circles */}
          <ProgressCircles steps={[typedValue !== '']} disabled={true} />
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
                Expected {expectedBaseTokens?.toSignificant(4)} {userBaseTokenBalance?.currency.symbol}
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

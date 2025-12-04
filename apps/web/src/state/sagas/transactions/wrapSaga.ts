import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { BigNumber } from '@ethersproject/bignumber'
import { popupRegistry } from 'components/Popups/registry'
import { PopupType } from 'components/Popups/types'
import { INTERNAL_JSON_RPC_ERROR_CODE } from 'constants/misc'
import { useAccount } from 'hooks/useAccount'
import useSelectChain from 'hooks/useSelectChain'
import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { handleOnChainStep } from 'state/sagas/transactions/utils'
import { call } from 'typed-redux-saga'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { HandleOnChainStepParams, TransactionStepType } from 'uniswap/src/features/transactions/steps/types'
import { WrapTransactionStep } from 'uniswap/src/features/transactions/steps/wrap'
import { WrapCallback, WrapCallbackParams } from 'uniswap/src/features/transactions/swap/types/wrapCallback'
import { TransactionType, WrapTransactionInfo } from 'uniswap/src/features/transactions/types/transactionDetails'
import { createSaga } from 'uniswap/src/utils/saga'
import { logger } from 'utilities/src/logger/logger'
import { noop } from 'utilities/src/react/noop'
import { didUserReject } from 'utils/swapErrorToUserReadableMessage'
import {
  encodeSmartPoolWrapEth,
  encodeSmartPoolUnwrapWETH9,
  isWETHDepositCalldata,
  isWETHWithdrawCalldata,
  extractWETHWithdrawAmount,
} from 'state/sagas/transactions/smartPoolWrapUtils'

interface HandleWrapStepParams extends Omit<HandleOnChainStepParams<WrapTransactionStep>, 'info'> {}
function* handleWrapStep(params: HandleWrapStepParams) {
  const info = getWrapTransactionInfo(params.step.amount)
  return yield* call(handleOnChainStep, { ...params, info })
}

type WrapParams = WrapCallbackParams & { selectChain: (chainId: number) => Promise<boolean>; startChainId?: number }

function* wrap(params: WrapParams) {
  try {
    const { account, smartPoolAddress, inputCurrencyAmount, selectChain, txRequest, startChainId, onFailure } = params

    // Switch chains if needed
    if (txRequest.chainId !== startChainId) {
      const chainSwitched = yield* call(selectChain, txRequest.chainId)
      if (!chainSwitched) {
        onFailure()
        return
      }
    }

    const step = { type: TransactionStepType.WrapTransaction, txRequest, amount: inputCurrencyAmount } as const
    smartPoolAddress && (step.txRequest.to = smartPoolAddress)
    step.txRequest.from = account.address
    step.txRequest.gasLimit = BigNumber.from(step.txRequest.gasLimit).add(100000) // Add buffer to gas limit

    // Override wrap transaction calldata for smart pool
    if (smartPoolAddress && step.txRequest.data) {
      const calldata = typeof step.txRequest.data === 'string' ? step.txRequest.data : step.txRequest.data.toString()
      const originalValue = step.txRequest.value || '0'

      if (isWETHDepositCalldata(calldata)) {
        // ETH -> WETH (wrap): use pool.wrapEth(amount) instead of weth.deposit()
        // Use the transaction value as the amount parameter
        const wrapAmount = BigNumber.from(originalValue).toString()
        step.txRequest.data = encodeSmartPoolWrapEth(wrapAmount)
        step.txRequest.value = String(0) // Set value to 0 since smart pool handles the ETH
        console.log(`Modified WETH deposit to smart pool wrapEth(${wrapAmount})`)
      } else if (isWETHWithdrawCalldata(calldata)) {
        // WETH -> ETH (unwrap): use pool.unwrapWETH9(amount) instead of weth.withdraw(amount)
        // Extract amount from original calldata
        const unwrapAmount = extractWETHWithdrawAmount(calldata)
        step.txRequest.data = encodeSmartPoolUnwrapWETH9(unwrapAmount)
        step.txRequest.value = String(0) // Ensure value is zero for unwrap
        console.log(`Modified WETH withdraw to smart pool unwrapWETH9(${unwrapAmount})`)
      }
    } else {
      // For non-smart pool transactions, ensure value is 0 if not wrap
      step.txRequest.value = String(0)
    }

    console.log('Wrap txRequest:', step.txRequest)

    const hash = yield* call(handleWrapStep, {
      step,
      address: account.address,
      smartPoolAddress,
      setCurrentStep: noop,
      shouldWaitForConfirmation: false,
      allowDuplicativeTx: true, // Compared to UniswapX wraps, the user should not be stopped from wrapping in quick succession
    })

    popupRegistry.addPopup({ type: PopupType.Transaction, hash }, hash)

    params.onSuccess()
  } catch (error) {
    if (didUserReject(error)) {
      params.onFailure()
      return
    }

    if (!(isTestnetChain(params.txRequest.chainId) && error.code === INTERNAL_JSON_RPC_ERROR_CODE)) {
      logger.error(error, {
        tags: {
          file: 'wrapSaga',
          function: 'wrap',
          chainId: params.txRequest.chainId,
        },
      })
    }
    params.onFailure()
  }
}

function getWrapTransactionInfo(amount: CurrencyAmount<Currency>): WrapTransactionInfo {
  return amount.currency.isNative
    ? {
        type: TransactionType.Wrap,
        unwrapped: false,
        currencyAmountRaw: amount.quotient.toString(),
      }
    : {
        type: TransactionType.Wrap,
        unwrapped: true,
        currencyAmountRaw: amount.quotient.toString(),
      }
}

export const wrapSaga = createSaga(wrap, 'wrap')

export function useWrapCallback(): WrapCallback {
  const appDispatch = useDispatch()
  const selectChain = useSelectChain()
  const startChainId = useAccount().chainId

  return useCallback(
    (params: WrapCallbackParams) => {
      appDispatch(wrapSaga.actions.trigger({ ...params, selectChain, startChainId }))
    },
    [appDispatch, selectChain, startChainId],
  )
}

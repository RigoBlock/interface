import { BigNumber } from '@ethersproject/bignumber'
import { normalizeTokenAddressForCache } from '@universe/chains'
import invariant from 'tiny-invariant'
import { call } from 'typed-redux-saga'
import { InterfaceEventName, LiquidityEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import type { UniverseEventProperties } from 'uniswap/src/features/telemetry/types'
import type { CollectFeesTransactionStep } from 'uniswap/src/features/transactions/liquidity/steps/collectFees'
import type { DecreasePositionTransactionStep } from 'uniswap/src/features/transactions/liquidity/steps/decreasePosition'
import { generateLPTransactionSteps } from 'uniswap/src/features/transactions/liquidity/steps/generateLPTransactionSteps'
import type {
  IncreasePositionTransactionStep,
  IncreasePositionTransactionStepAsync,
  IncreasePositionTransactionStepWalletCall,
} from 'uniswap/src/features/transactions/liquidity/steps/increasePosition'
import {
  MigratePositionTransactionStep,
  MigratePositionTransactionStepAsync,
  MigratePositionTransactionStepWalletCall,
} from 'uniswap/src/features/transactions/liquidity/steps/migrate'
import type { LiquidityAction, ValidatedLiquidityTxContext } from 'uniswap/src/features/transactions/liquidity/types'
import { LiquidityTransactionType } from 'uniswap/src/features/transactions/liquidity/types'
import type { HandleOnChainStepParams, TransactionStep } from 'uniswap/src/features/transactions/steps/types'
import { TransactionStepType } from 'uniswap/src/features/transactions/steps/types'
import type { SetCurrentStepFn } from 'uniswap/src/features/transactions/swap/types/swapCallback'
import {
  CollectFeesTransactionInfo,
  CreatePoolTransactionInfo,
  LiquidityDecreaseTransactionInfo,
  LiquidityIncreaseTransactionInfo,
  MigrateV3LiquidityToV4TransactionInfo,
} from 'uniswap/src/features/transactions/types/transactionDetails'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { SignerMnemonicAccountDetails } from 'uniswap/src/features/wallet/types/AccountDetails'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { createSaga } from 'uniswap/src/utils/saga'
import { logger } from 'utilities/src/logger/logger'
import { RPC_PROVIDERS } from '~/constants/providers'
import { popupRegistry } from '~/state/popups/registry'
import { PopupType } from '~/state/popups/types'
import { getLiquidityEventName } from '~/state/sagas/liquidity/getLiquidityEventName'
import { handleAtomicSendCalls } from '~/state/sagas/transactions/5792'
import {
  getDisplayableError,
  handleApprovalTransactionStep,
  handleOnChainStep,
  handlePermitTransactionStep,
} from '~/state/sagas/transactions/utils'

type LiquidityParams = {
  selectChain: (chainId: number) => Promise<boolean>
  startChainId?: number
  account: SignerMnemonicAccountDetails
  analytics?:
    | Omit<UniverseEventProperties[LiquidityEventName.AddLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.RemoveLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.MigrateLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.CollectLiquiditySubmitted], 'transaction_hash'>
  liquidityTxContext: ValidatedLiquidityTxContext
  setCurrentStep: SetCurrentStepFn
  setSteps: (steps: TransactionStep[]) => void
  onSuccess: () => void
  onFailure: (e?: unknown) => void
  disableOneClickSwap?: () => void
  /** RigoBlock: active smart pool (vault) address when the LP action runs in vault context. */
  smartPoolAddress?: string
}

const RIGOBLOCK_LIQUIDITY_GAS_OVERHEAD = 250000

function* estimateSmartPoolLiquidityGas(params: {
  txRequest: { to?: string; data?: unknown; gasLimit?: unknown }
  address: string
  smartPoolAddress: string
  chainId: number
}) {
  const { txRequest, address, smartPoolAddress, chainId } = params
  const provider = chainId in RPC_PROVIDERS ? RPC_PROVIDERS[chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    throw new Error(`estimateSmartPoolLiquidityGas: no RPC provider for chain ${chainId}`)
  }
  let estimate: BigNumber
  try {
    estimate = yield* call([provider, provider.estimateGas], {
      from: address,
      to: smartPoolAddress,
      data: txRequest.data ? txRequest.data.toString() : undefined,
      value: '0',
    })
  } catch (gasError) {
    // Never send a vault-routed LP tx without a gasLimit: if it cannot be estimated locally, it
    // would also revert onchain (estimation only fails when the tx itself is not executable).
    // Aborting here surfaces as a TransactionStepFailedError instead of wasting a reverted tx.
    logger.warn('liquiditySaga', 'estimateSmartPoolLiquidityGas', 'Gas estimation failed, aborting LP tx', {
      error: gasError,
    })
    throw gasError
  }
  // 20% margin, same convention as the swap saga's smart-pool estimation
  txRequest.gasLimit = estimate.mul(120).div(100).add(RIGOBLOCK_LIQUIDITY_GAS_OVERHEAD).toString()
}

function* getLiquidityTxRequest(
  step:
    | IncreasePositionTransactionStep
    | IncreasePositionTransactionStepAsync
    | DecreasePositionTransactionStep
    | MigratePositionTransactionStep
    | MigratePositionTransactionStepAsync
    | CollectFeesTransactionStep,
  signature: string | undefined,
) {
  if (
    step.type === TransactionStepType.IncreasePositionTransaction ||
    step.type === TransactionStepType.DecreasePositionTransaction
  ) {
    return { txRequest: step.txRequest }
  }
  if (
    step.type === TransactionStepType.MigratePositionTransaction ||
    step.type === TransactionStepType.CollectFeesTransactionStep
  ) {
    return { txRequest: step.txRequest }
  }

  if (!signature) {
    throw new Error('Signature required for async increase position transaction step')
  }

  const { txRequest } = yield* call(step.getTxRequest, signature)
  invariant(txRequest !== undefined, 'txRequest must be defined')

  return { txRequest }
}

interface HandlePositionStepParams extends Omit<HandleOnChainStepParams, 'step' | 'info'> {
  step:
    | IncreasePositionTransactionStep
    | IncreasePositionTransactionStepAsync
    | DecreasePositionTransactionStep
    | MigratePositionTransactionStep
    | MigratePositionTransactionStepAsync
    | CollectFeesTransactionStep
  signature?: string
  action: LiquidityAction
  /** RigoBlock: vault address + chain for smart-pool gas handling. */
  smartPoolAddress?: string
  chainId: number
  analytics?:
    | Omit<UniverseEventProperties[LiquidityEventName.AddLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.RemoveLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.MigrateLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.CollectLiquiditySubmitted], 'transaction_hash'>
}
function* handlePositionTransactionStep(params: HandlePositionStepParams) {
  const { action, step, signature, analytics, smartPoolAddress, chainId } = params
  const info = getLiquidityTransactionInfo(action)
  const { txRequest } = yield* call(getLiquidityTxRequest, step, signature)

  const onModification = ({ hash, data }: { hash: string; data: string }) => {
    if (analytics) {
      sendAnalyticsEvent(LiquidityEventName.TransactionModifiedInWallet, {
        ...analytics,
        transaction_hash: hash,
        expected: txRequest.data?.toString(),
        actual: data,
      })
    }
  }

  // Now that we have the txRequest, we can create a definitive LiquidityTransactionStep, incase we started with an async step.
  // Add gas overhead for RigoBlock smart pool transactions (remove liquidity, collect fees).
  // Smart pool routing adds gas overhead for the pool contract execution.
  // Detection is explicit: the client-side overrides in the LP tx hooks set txRequest.to = vault,
  // so compare against the vault address — a plain "to !== EOA" check would match every LP tx.
  const isSmartPoolTx =
    smartPoolAddress &&
    txRequest.to &&
    normalizeTokenAddressForCache(txRequest.to) === normalizeTokenAddressForCache(smartPoolAddress)
  if (isSmartPoolTx) {
    if (txRequest.gasLimit) {
      txRequest.gasLimit = BigNumber.from(txRequest.gasLimit).add(RIGOBLOCK_LIQUIDITY_GAS_OVERHEAD).toString()
    } else {
      // The liquidity API returns no gasLimit when server simulation is skipped (smart pools), and
      // ethers would otherwise estimate through the gateway — which cannot simulate vault-routed LP
      // calldata. Estimate locally against the vault; if estimation fails, abort (the tx would
      // revert onchain anyway) rather than sending with a guessed gasLimit.
      yield* call(estimateSmartPoolLiquidityGas, {
        txRequest,
        address: params.address,
        smartPoolAddress,
        chainId,
      })
    }
  }
  const onChainStep = { ...step, txRequest }
  let hash: string | undefined
  try {
    hash = yield* call(handleOnChainStep, {
      ...params,
      info,
      step: onChainStep,
      shouldWaitForConfirmation: false,
      onModification,
    })
  } catch (e) {
    if (analytics) {
      sendAnalyticsEvent(InterfaceEventName.OnChainAddLiquidityFailed, {
        ...analytics,
        message: e.message,
      })
    }

    throw e
  }

  if (analytics) {
    sendAnalyticsEvent(getLiquidityEventName(onChainStep.type), {
      ...analytics,
      transaction_hash: hash,
    } satisfies
      | UniverseEventProperties[LiquidityEventName.AddLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.RemoveLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.MigrateLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.CollectLiquiditySubmitted])
  }

  popupRegistry.addPopup({ type: PopupType.Transaction, hash }, hash)
}

interface HandlePositionWalletCallStepParams extends Omit<HandleOnChainStepParams, 'step' | 'info'> {
  step: IncreasePositionTransactionStepWalletCall | MigratePositionTransactionStepWalletCall
  disableOneClickSwap?: () => void
  action: LiquidityAction
  analytics?:
    | Omit<UniverseEventProperties[LiquidityEventName.AddLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.RemoveLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.MigrateLiquiditySubmitted], 'transaction_hash'>
    | Omit<UniverseEventProperties[LiquidityEventName.CollectLiquiditySubmitted], 'transaction_hash'>
}
function* handlePositionTransactionWalletCallStep(params: HandlePositionWalletCallStepParams) {
  const { action, step, analytics, disableOneClickSwap } = params

  const info = getLiquidityTransactionInfo(action)

  const batchId = yield* handleAtomicSendCalls({
    ...params,
    info,
    step,
    ignoreInterrupt: true,
    shouldWaitForConfirmation: false,
    disableOneClickSwap,
  })

  if (analytics) {
    sendAnalyticsEvent(getLiquidityEventName(TransactionStepType.IncreasePositionTransaction), {
      ...analytics,
      transaction_hash: batchId,
    } satisfies
      | UniverseEventProperties[LiquidityEventName.AddLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.RemoveLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.MigrateLiquiditySubmitted]
      | UniverseEventProperties[LiquidityEventName.CollectLiquiditySubmitted])
  }

  popupRegistry.addPopup({ type: PopupType.Transaction, hash: batchId }, batchId)
}

function* modifyLiquidity(params: LiquidityParams & { steps: TransactionStep[] }) {
  const {
    account,
    setCurrentStep,
    steps,
    liquidityTxContext: { action },
    onSuccess,
    onFailure,
    analytics,
    disableOneClickSwap,
  } = params

  let signature: string | undefined

  // Note: Smart pool batching prevention is handled upstream in transaction contexts
  // by setting canBatchTransactions to false when smartPoolAddress exists

  for (const step of steps) {
    try {
      switch (step.type) {
        case TransactionStepType.TokenRevocationTransaction:
        case TransactionStepType.TokenApprovalTransaction: {
          yield* call(handleApprovalTransactionStep, {
            address: account.address,
            step,
            setCurrentStep,
          })
          break
        }
        case TransactionStepType.Permit2Signature: {
          signature = undefined //yield* call(handleSignatureStep, { address: account.address, step, setCurrentStep })
          break
        }
        case TransactionStepType.Permit2Transaction: {
          yield* call(handlePermitTransactionStep, {
            address: account.address,
            step,
            setCurrentStep,
          })
          break
        }
        case TransactionStepType.IncreasePositionTransaction:
        case TransactionStepType.IncreasePositionTransactionAsync:
        case TransactionStepType.DecreasePositionTransaction:
        case TransactionStepType.MigratePositionTransaction:
        case TransactionStepType.MigratePositionTransactionAsync:
        case TransactionStepType.CollectFeesTransactionStep:
          yield* call(handlePositionTransactionStep, {
            address: account.address,
            step,
            setCurrentStep,
            action,
            signature,
            smartPoolAddress: params.smartPoolAddress,
            chainId: params.liquidityTxContext.action.currency0Amount.currency.chainId,
            analytics,
          })
          break
        case TransactionStepType.IncreasePositionTransactionWalletCall:
        case TransactionStepType.MigratePositionTransactionWalletCall:
          yield* call(handlePositionTransactionWalletCallStep, {
            address: account.address,
            step,
            setCurrentStep,
            action,
            analytics,
            disableOneClickSwap,
          })
          break
        default: {
          throw new Error('Unexpected step type')
        }
      }
    } catch (e) {
      const displayableError = getDisplayableError({
        error: e,
        step,
        flow: 'liquidity',
      })

      if (displayableError) {
        logger.error(displayableError, {
          tags: { file: 'liquiditySaga', function: 'modifyLiquidity' },
          extra: {
            canBatchTransactions: params.liquidityTxContext.canBatchTransactions,
            delegatedAddress: params.liquidityTxContext.delegatedAddress,
          },
        })
        onFailure(e)
      } else {
        onFailure()
      }

      return
    }
  }

  yield* call(onSuccess)
}

function* liquidity(params: LiquidityParams) {
  const { liquidityTxContext, startChainId, selectChain, onFailure } = params

  const steps = yield* call(generateLPTransactionSteps, liquidityTxContext)
  params.setSteps(steps)

  // Switch chains if needed
  const token0ChainId = liquidityTxContext.action.currency0Amount.currency.chainId
  const token1ChainId = liquidityTxContext.action.currency1Amount.currency.chainId

  if (token0ChainId !== token1ChainId) {
    logger.error('Tokens must be on the same chain', {
      tags: { file: 'liquiditySaga', function: 'liquidity' },
    })
    onFailure()
    return undefined
  }

  if (token0ChainId !== startChainId) {
    const chainSwitched = yield* call(selectChain, token0ChainId)
    if (!chainSwitched) {
      onFailure()
      return undefined
    }
  }

  return yield* modifyLiquidity({
    ...params,
    steps,
  })
}

// restartOnRetrigger: the confirm button stays pressable until a transaction step starts, so a
// retry while the saga is stuck awaiting a chain switch (e.g. a wallet prompt dismissed natively
// without settling the request) must cancel the stalled run and start over instead of being dropped.
export const liquiditySaga = createSaga(liquidity, 'liquiditySaga', { restartOnRetrigger: true })

function getLiquidityTransactionInfo(
  action: LiquidityAction,
):
  | LiquidityIncreaseTransactionInfo
  | LiquidityDecreaseTransactionInfo
  | MigrateV3LiquidityToV4TransactionInfo
  | CreatePoolTransactionInfo
  | CollectFeesTransactionInfo {
  let type: TransactionType
  switch (action.type) {
    case LiquidityTransactionType.Create:
      type = TransactionType.CreatePool
      break
    case LiquidityTransactionType.Increase:
      type = TransactionType.LiquidityIncrease
      break
    case LiquidityTransactionType.Decrease:
      type = TransactionType.LiquidityDecrease
      break
    case LiquidityTransactionType.Migrate:
      type = TransactionType.MigrateLiquidityV3ToV4
      break
    case LiquidityTransactionType.Collect:
      type = TransactionType.CollectFees
  }

  const {
    currency0Amount: { currency: currency0, quotient: quotient0 },
    currency1Amount: { currency: currency1, quotient: quotient1 },
  } = action
  return {
    type,
    currency0Id: currencyId(currency0),
    currency1Id: currencyId(currency1),
    currency0AmountRaw: quotient0.toString(),
    currency1AmountRaw: quotient1.toString(),
  }
}

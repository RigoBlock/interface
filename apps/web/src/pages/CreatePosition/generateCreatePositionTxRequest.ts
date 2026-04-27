import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import {
  CreateLPPositionRequest,
  CreateLPPositionResponse,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import { V4CreateLPPosition } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/types_pb'
import {
  CreateClassicPositionResponse,
  CreatePositionRequest,
  CreatePositionResponse,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/api_pb'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { PositionField } from '~/types/position'
import { NormalizedApprovalData } from 'uniswap/src/data/apiClients/liquidityService/normalizeApprovalResponse'
import { CreatePositionTxAndGasInfo, LiquidityTransactionType } from 'uniswap/src/features/transactions/liquidity/types'
import { PermitMethod } from 'uniswap/src/features/transactions/swap/types/swapTxAndGasInfo'
import { validatePermit, validateTransactionRequest } from 'uniswap/src/features/transactions/swap/utils/trade'

/**
 * @internal - exported for testing
 */
export function generateCreatePositionTxRequest({
  protocolVersion,
  approvalCalldata,
  createCalldata,
  createCalldataQueryParams,
  currencyAmounts,
  poolOrPair,
  canBatchTransactions,
  delegatedAddress,
  smartPoolAddress,
  account,
}: {
  protocolVersion: ProtocolVersion
  approvalCalldata?: NormalizedApprovalData
  createCalldata?: CreateLPPositionResponse | CreateClassicPositionResponse | CreatePositionResponse
  createCalldataQueryParams?: CreateLPPositionRequest | CreatePositionRequest
  currencyAmounts?: { [field in PositionField]?: Maybe<CurrencyAmount<Currency>> }
  poolOrPair: Pair | undefined
  canBatchTransactions: boolean
  delegatedAddress: string | null
  smartPoolAddress?: string
  account?: { address: string }
}): CreatePositionTxAndGasInfo | undefined {
  if (!createCalldata || !currencyAmounts?.TOKEN0 || !currencyAmounts.TOKEN1) {
    return undefined
  }

  const validatedApprove0Request = validateTransactionRequest(approvalCalldata?.token0Approval)
  if (approvalCalldata?.token0Approval && !validatedApprove0Request) {
    return undefined
  }

  const validatedApprove1Request = validateTransactionRequest(approvalCalldata?.token1Approval)
  if (approvalCalldata?.token1Approval && !validatedApprove1Request) {
    return undefined
  }

  const validatedRevoke0Request = validateTransactionRequest(approvalCalldata?.token0Cancel)
  if (approvalCalldata?.token0Cancel && !validatedRevoke0Request) {
    return undefined
  }

  const validatedRevoke1Request = validateTransactionRequest(approvalCalldata?.token1Cancel)
  if (approvalCalldata?.token1Cancel && !validatedRevoke1Request) {
    return undefined
  }

  const validatedPermitRequest = validatePermit(approvalCalldata?.v4BatchPermitData)
  if (approvalCalldata?.v4BatchPermitData && !validatedPermitRequest) {
    return undefined
  }

  const validatedToken0PermitTransaction = validateTransactionRequest(approvalCalldata?.token0PermitTransaction)
  const validatedToken1PermitTransaction = validateTransactionRequest(approvalCalldata?.token1PermitTransaction)

  const txRequest = validateTransactionRequest(createCalldata.create)
  if (!txRequest && !(validatedToken0PermitTransaction || validatedToken1PermitTransaction)) {
    return undefined
  }

  // Override transaction fields for smart pools
  const finalTxRequest =
    txRequest && smartPoolAddress && account
      ? {
          ...txRequest,
          to: smartPoolAddress,
          from: account.address,
          value: String(0),
          // Do NOT set gasLimit — leave it unset so the wallet calls eth_estimateGas on the
          // actual EOA→vault tx, which simulates the full execution path including settler overhead.
          gasLimit: undefined,
        }
      : txRequest

  let updatedCreateCalldataQueryParams: CreateLPPositionRequest | CreatePositionRequest | undefined
  if (createCalldataQueryParams instanceof CreateLPPositionRequest &&
      createCalldataQueryParams.createLpPosition.case === 'v4CreateLpPosition') {
    // V1 V4: inject batch permit data before the async re-submission step
    updatedCreateCalldataQueryParams = new CreateLPPositionRequest({
      createLpPosition: {
        case: 'v4CreateLpPosition',
        value: new V4CreateLPPosition({
          ...createCalldataQueryParams.createLpPosition.value,
          batchPermitData: approvalCalldata?.v4BatchPermitData,
        }),
      },
    })
  } else {
    // V1 non-V4 or V2: pass through as-is (V2 permit handled via signature in async step)
    updatedCreateCalldataQueryParams = createCalldataQueryParams
  }

  // RigoBlock smart pools handle approvals internally, so skip all approval/permit steps
  const isRigoBlockPool = !!smartPoolAddress

  return {
    type: LiquidityTransactionType.Create,
    canBatchTransactions,
    delegatedAddress,
    unsigned: Boolean(validatedPermitRequest),
    createPositionRequestArgs: updatedCreateCalldataQueryParams,
    action: {
      type: LiquidityTransactionType.Create,
      currency0Amount: currencyAmounts.TOKEN0,
      currency1Amount: currencyAmounts.TOKEN1,
      liquidityToken: protocolVersion === ProtocolVersion.V2 ? poolOrPair?.liquidityToken : undefined,
    },
    approveToken0Request: isRigoBlockPool ? undefined : validatedApprove0Request,
    approveToken1Request: isRigoBlockPool ? undefined : validatedApprove1Request,
    txRequest: finalTxRequest,
    approvePositionTokenRequest: undefined,
    revokeToken0Request: isRigoBlockPool ? undefined : validatedRevoke0Request,
    revokeToken1Request: isRigoBlockPool ? undefined : validatedRevoke1Request,
    permit: isRigoBlockPool
      ? undefined
      : validatedPermitRequest
        ? { method: PermitMethod.TypedData, typedData: validatedPermitRequest }
        : undefined,
    token0PermitTransaction: isRigoBlockPool ? undefined : validatedToken0PermitTransaction,
    token1PermitTransaction: isRigoBlockPool ? undefined : validatedToken1PermitTransaction,
    positionTokenPermitTransaction: undefined,
  } satisfies CreatePositionTxAndGasInfo
}

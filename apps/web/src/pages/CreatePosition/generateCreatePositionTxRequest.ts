import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import {
  CheckApprovalLPResponse,
  CreateLPPositionRequest,
  CreateLPPositionResponse,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import { V4CreateLPPosition } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/types_pb'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { PositionField } from '~/types/position'
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
  approvalCalldata?: CheckApprovalLPResponse
  createCalldata?: CreateLPPositionResponse
  createCalldataQueryParams?: CreateLPPositionRequest
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

  const validatedPermitRequest = validatePermit(approvalCalldata?.permitData.value)
  if (approvalCalldata?.permitData.value && !validatedPermitRequest) {
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
          gasLimit: Number(250000).toString(),
        }
      : txRequest

  let updatedCreateCalldataQueryParams: CreateLPPositionRequest | undefined
  if (createCalldataQueryParams?.createLpPosition.case === 'v4CreateLpPosition') {
    updatedCreateCalldataQueryParams = new CreateLPPositionRequest({
      createLpPosition: {
        case: 'v4CreateLpPosition',
        value: new V4CreateLPPosition({
          ...createCalldataQueryParams.createLpPosition.value,
          batchPermitData:
            approvalCalldata?.permitData.case === 'permitBatchData' ? approvalCalldata.permitData.value : undefined,
        }),
      },
    })
  } else {
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
    sqrtRatioX96: createCalldata.sqrtRatioX96,
  } satisfies CreatePositionTxAndGasInfo
}

import { useQuery } from '@tanstack/react-query'
import { Protocols } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/types_pb'
import { DecreasePositionRequest, LPApprovalRequest } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/api_pb'
import { LPAction, LPToken } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/types_pb'
import { useEffect, useMemo, useState } from 'react'
import { liquidityQueries } from 'uniswap/src/data/apiClients/liquidityService/liquidityQueries'
import { useCheckLPApprovalQuery } from 'uniswap/src/data/apiClients/liquidityService/useCheckLPApprovalQuery'
import { getTradeSettingsDeadline } from 'uniswap/src/data/apiClients/tradingApi/utils/getTradeSettingsDeadline'
import { toSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useTransactionGasFee, useUSDCurrencyAmountOfGasFee } from 'uniswap/src/features/gas/hooks'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { getIsPermissioned } from 'uniswap/src/features/positions/utils'
import { InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { useTransactionSettingsStore } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { useLogLiquidityTxError } from 'uniswap/src/features/transactions/liquidity/useLogLiquidityTxError'
import { getErrorMessageToDisplay, parseErrorMessageTitle } from 'uniswap/src/features/transactions/liquidity/utils'
import { TransactionStepType } from 'uniswap/src/features/transactions/steps/types'
import { getWrappedTokenIfExists } from 'uniswap/src/utils/currency'
import { logger } from 'utilities/src/logger/logger'
import { ONE_SECOND_MS } from 'utilities/src/time/time'
import { LP_GAS_URGENCY } from '~/features/Liquidity/constants'
import { getTokenOrZeroAddress } from '~/features/Liquidity/utils/currency'
import { getProtocols } from '~/features/Liquidity/utils/protocolVersion'
import { useRemoveLiquidityModalContext } from '~/pages/RemoveLiquidity/RemoveLiquidityModalContext'
import type { RemoveLiquidityTxInfo } from '~/pages/RemoveLiquidity/RemoveLiquidityTxContext'

function buildCheckApprovalLPRequest({
  positionInfo,
  walletAddress,
}: {
  positionInfo: PositionInfo
  walletAddress: string
}): LPApprovalRequest | undefined {
  const protocol = getProtocols(positionInfo.version)

  if (protocol === undefined) {
    return undefined
  }

  switch (protocol) {
    case Protocols.V2:
      return new LPApprovalRequest({
        walletAddress,
        protocol,
        chainId: positionInfo.liquidityToken?.chainId,
        lpTokens: [
          new LPToken({
            tokenAddress: getWrappedTokenIfExists(positionInfo.currency0Amount.currency)?.address,
            amount: '0', // the amounts here don't matter since the approval is based on the positionToken
          }),
          new LPToken({
            tokenAddress: getWrappedTokenIfExists(positionInfo.currency1Amount.currency)?.address,
            amount: '0',
          }),
        ],
        action: LPAction.DECREASE,
        simulateTransaction: true,
      })
    default:
      return undefined
  }
}

// oxlint-disable-next-line complexity
export function useRemoveLiquidityTxAndGasInfo({ account }: { account?: string }): RemoveLiquidityTxInfo {
  const { positionInfo, percent, percentInvalid, currencies, currentTransactionStep, unwrapNativeCurrency } =
    useRemoveLiquidityModalContext()
  const { customDeadline, customSlippageTolerance } = useTransactionSettingsStore((s) => ({
    customDeadline: s.customDeadline,
    customSlippageTolerance: s.customSlippageTolerance,
  }))

  const [transactionError, setTransactionError] = useState<string | boolean>(false)

  const currency0 = currencies?.TOKEN0
  const currency1 = currencies?.TOKEN1

  const approvalQueryParams = useMemo(() => {
    if (!positionInfo || !account || percentInvalid) {
      return undefined
    }

    return buildCheckApprovalLPRequest({
      positionInfo,
      walletAddress: account,
    })
  }, [positionInfo, account, percentInvalid])

  const {
    approvalData: v2LpTokenApproval,
    approvalLoading: v2ApprovalLoading,
    approvalError,
    approvalRefetch,
  } = useCheckLPApprovalQuery({
    approvalQueryParams,
    isQueryEnabled: Boolean(approvalQueryParams),
    positionTokenAddress: positionInfo?.liquidityToken?.address,
  })

  const approvalErrorMessage = approvalError
    ? parseErrorMessageTitle(approvalError, { defaultTitle: 'unknown CheckLpApprovalQuery' })
    : undefined

  useEffect(() => {
    if (!approvalErrorMessage) {
      return
    }

    logger.info('RemoveLiquidityTxAndGasInfo', 'RemoveLiquidityTxAndGasInfo', approvalErrorMessage, {
      error: JSON.stringify(approvalError),
      v2LpTokenApprovalQueryParams: JSON.stringify(approvalQueryParams),
    })
    // Keyed on the parsed message alone, as in `useLogLiquidityTxError`: the error object and the
    // query params are rebuilt on every render, so depending on them would restore the per-render
    // logging — and both `JSON.stringify` calls — that this replaces.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- dedupe is keyed on the message only
  }, [approvalErrorMessage])

  const v2ApprovalGasFeeUSD =
    useUSDCurrencyAmountOfGasFee(
      positionInfo?.liquidityToken?.chainId,
      v2LpTokenApproval?.gasFeePositionTokenApproval,
    ) ?? undefined

  const approvalsNeeded = !v2ApprovalLoading && Boolean(v2LpTokenApproval?.positionTokenApproval)

  const decreaseCalldataQueryParams = useMemo((): DecreasePositionRequest | undefined => {
    if (!positionInfo || !account || percentInvalid || !currency0 || !currency1) {
      return undefined
    }

    return new DecreasePositionRequest({
      walletAddress: account,
      chainId: currency0.chainId,
      protocol: getProtocols(positionInfo.version),
      token0Address: getTokenOrZeroAddress(currency0),
      token1Address: getTokenOrZeroAddress(currency1),
      nftTokenId: positionInfo.tokenId,
      permissioned: getIsPermissioned(positionInfo),
      liquidityPercentageToDecrease: Number(percent),
      slippageTolerance: customSlippageTolerance,
      deadline: getTradeSettingsDeadline(customDeadline),
      simulateTransaction: !approvalsNeeded,
      withdrawAsWeth: !unwrapNativeCurrency,
    })
  }, [
    positionInfo,
    account,
    percent,
    customDeadline,
    unwrapNativeCurrency,
    approvalsNeeded,
    customSlippageTolerance,
    percentInvalid,
    currency0,
    currency1,
  ])

  const isUserCommittedToDecrease =
    currentTransactionStep?.step.type === TransactionStepType.DecreasePositionTransaction
  const isQueryEnabled =
    !isUserCommittedToDecrease &&
    ((!percentInvalid && !approvalQueryParams) || (!v2ApprovalLoading && !approvalError && Boolean(v2LpTokenApproval)))

  const {
    data: decreaseCalldata,
    isLoading: decreaseCalldataLoading,
    error: calldataError,
    refetch: calldataRefetch,
  } = useQuery(
    liquidityQueries.decreasePosition({
      params: decreaseCalldataQueryParams,
      refetchInterval: transactionError ? false : 5 * ONE_SECOND_MS,
      retry: false,
      enabled: isQueryEnabled && Boolean(decreaseCalldataQueryParams),
    }),
  )

  useEffect(() => {
    setTransactionError(getErrorMessageToDisplay({ approvalError, calldataError }))
  }, [calldataError, decreaseCalldataQueryParams, approvalError])

  useLogLiquidityTxError({
    error: calldataError,
    defaultTitle: 'DecreaseLpPositionCalldataQuery',
    file: 'RemoveLiquidityTxAndGasInfo',
    functionName: 'liquidityQueries.decreasePosition',
    onError: (message) => {
      sendAnalyticsEvent(InterfaceEventName.DecreaseLiquidityFailed, {
        message,
        // oxlint-disable-next-line typescript/no-misused-spread -- biome-parity: oxlint is stricter here
        ...decreaseCalldataQueryParams,
      })
    },
  })

  const { displayValue: estimatedGasFee } = useTransactionGasFee({
    tx: decreaseCalldata?.decrease,
    skip: !!decreaseCalldata?.gasFee,
    urgency: LP_GAS_URGENCY,
  })
  const decreaseGasFeeUsd =
    useUSDCurrencyAmountOfGasFee(
      toSupportedChainId(decreaseCalldata?.decrease?.chainId) ?? undefined,
      decreaseCalldata?.gasFee || estimatedGasFee,
    ) ?? undefined

  const totalGasFeeEstimate = v2ApprovalGasFeeUSD ? decreaseGasFeeUsd?.add(v2ApprovalGasFeeUSD) : decreaseGasFeeUsd

  return {
    gasFeeEstimateUSD: totalGasFeeEstimate,
    decreaseCalldataLoading,
    decreaseCalldata,
    v2LpTokenApproval,
    approvalLoading: v2ApprovalLoading,
    error: getErrorMessageToDisplay({ approvalError, calldataError }),
    refetch: approvalError ? approvalRefetch : calldataError ? calldataRefetch : undefined,
  }
}

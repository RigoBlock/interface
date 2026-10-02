import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import {
  CreateClassicPositionResponse,
  CreatePositionRequest,
  CreatePositionResponse,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/api_pb'
import { LPAction } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/types_pb'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { UniverseChainId, Platform } from '@universe/chains'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useSelector } from 'react-redux'
import { useUniswapContextSelector } from 'uniswap/src/contexts/UniswapContext'
import { useCheckLPApprovalQuery } from 'uniswap/src/data/apiClients/liquidityService/useCheckLPApprovalQuery'
import { useCreatePositionQuery } from 'uniswap/src/data/apiClients/liquidityService/useCreatePositionQuery'
import { useActiveAddress } from 'uniswap/src/features/accounts/store/hooks'
import { toSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useTransactionGasFee, useUSDCurrencyAmountOfGasFee } from 'uniswap/src/features/gas/hooks'
import { DelegatedState } from 'uniswap/src/features/smartWallet/delegation/types'
import { InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { useTransactionSettingsStore } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { CreatePositionTxAndGasInfo } from 'uniswap/src/features/transactions/liquidity/types'
import { useLogLiquidityTxError } from 'uniswap/src/features/transactions/liquidity/useLogLiquidityTxError'
import { getErrorMessageToDisplay } from 'uniswap/src/features/transactions/liquidity/utils'
import { TransactionStepType } from 'uniswap/src/features/transactions/steps/types'
import { LP_GAS_URGENCY } from '~/features/Liquidity/constants'
import { useDynamicNativeSlippage } from '~/features/Liquidity/Create/hooks/useLPSlippageValues'
import { useIsLiquidityApprovalSimulationEnabled } from '~/features/Liquidity/hooks/preEstimatedLiquidityGasUtils'
import { useCreatePositionDependentAmountFallback } from '~/features/Liquidity/hooks/useDependentAmountFallback'
import { generateLiquidityServiceCreateCalldataQueryParams } from '~/features/Liquidity/utils/generateLiquidityServiceCreateCalldata'
import { getCheckLPApprovalRequestParams } from '~/features/Liquidity/utils/getCheckLPApprovalRequestParams'
import { useCreateLiquidityContext } from '~/pages/CreatePosition/CreateLiquidityContextProvider'
import { generateCreatePositionTxRequest } from '~/pages/CreatePosition/generateCreatePositionTxRequest'
import { useCreatePositionDepositInfo } from '~/pages/CreatePosition/hooks/useCreatePositionDepositInfo'
import { useHookRejectsLiquidity } from '~/pages/CreatePosition/hooks/useHookRejectsLiquidity'
import { useActiveSmartPool } from '~/state/application/hooks'
import { PositionField } from '~/types/position'

interface CreatePositionTxContextType {
  txInfo?: CreatePositionTxAndGasInfo
  gasFeeEstimateUSD?: Maybe<CurrencyAmount<Currency>>
  transactionError: boolean | string
  setTransactionError: Dispatch<SetStateAction<string | boolean>>
  dependentAmount?: string
  currencyAmounts?: {
    [field in PositionField]?: Maybe<CurrencyAmount<Currency>>
  }
  inputError?: ReactNode
  formattedAmounts?: { [field in PositionField]?: string }
  currencyAmountsUSDValue?: {
    [field in PositionField]?: Maybe<CurrencyAmount<Currency>>
  }
  currencyBalances?: { [field in PositionField]?: CurrencyAmount<Currency> }
  preEstimatedGasFee?: string
  /** True when the CreatePosition error is attributable to the existing v4 pool's hook rejecting new liquidity. */
  hookRejectsLiquidity: boolean
}

const CreatePositionTxContext = createContext<CreatePositionTxContextType | undefined>(undefined)

// oxlint-disable-next-line complexity
export function CreatePositionTxContextProvider({ children }: PropsWithChildren): JSX.Element {
  const {
    protocolVersion,
    currencies,
    ticks,
    poolOrPair,
    depositState,
    creatingPoolOrPair,
    poolId,
    currentTransactionStep,
    positionState,
    setRefetch,
  } = useCreateLiquidityContext()
  const evmAddress = useActiveAddress(Platform.EVM)
  const smartPoolAddress = useActiveSmartPool().address
  const account = evmAddress ? { address: evmAddress } : undefined

  const {
    currencyMaxAmounts,
    currencyAmounts,
    inputError,
    formattedAmounts,
    currencyAmountsUSDValue,
    currencyBalances,
    preEstimatedGasFee,
    invalidRange,
  } = useCreatePositionDepositInfo({
    evmAddress,
    smartPoolAddress: smartPoolAddress ?? undefined,
    protocolVersion,
    currencies,
    ticks,
    poolOrPair,
    poolId,
    depositState,
  })

  const { customDeadline, customSlippageTolerance, isSlippageDirty } = useTransactionSettingsStore((s) => ({
    customDeadline: s.customDeadline,
    customSlippageTolerance: s.customSlippageTolerance,
    isSlippageDirty: s.isSlippageDirty,
  }))
  const isLiquidityBatchedTransactionsEnabled = useFeatureFlag(FeatureFlags.LiquidityBatchedTransactions)
  const canBatchTransactions =
    (useUniswapContextSelector((ctx) => ctx.getCanBatchTransactions?.(poolOrPair?.chainId)) ?? false) &&
    poolOrPair?.chainId !== UniverseChainId.Monad &&
    isLiquidityBatchedTransactionsEnabled &&
    !smartPoolAddress

  const delegatedAddress = useSelector((state: { delegation: DelegatedState }) =>
    poolOrPair?.chainId ? state.delegation.delegations[String(poolOrPair.chainId)] : null,
  )

  const [transactionError, setTransactionError] = useState<string | boolean>(false)

  const addLiquidityApprovalParams = useMemo(() => {
    // Smart pools handle approvals internally; skip the check to avoid blocking the calldata query
    if (smartPoolAddress) {
      return undefined
    }
    return getCheckLPApprovalRequestParams({
      walletAddress: evmAddress,
      protocolVersion,
      currencyAmounts,
      canBatchTransactions,
      action: LPAction.CREATE,
    })
  }, [evmAddress, smartPoolAddress, protocolVersion, currencyAmounts, canBatchTransactions])

  const {
    approvalData: approvalCalldata,
    approvalError,
    approvalLoading,
    approvalRefetch,
  } = useCheckLPApprovalQuery({
    approvalQueryParams: addLiquidityApprovalParams,
    isQueryEnabled: !!addLiquidityApprovalParams && !inputError && !transactionError && !invalidRange,
  })

  useLogLiquidityTxError({
    error: approvalError,
    defaultTitle: 'unknown CheckLpApprovalQuery',
    file: 'CreatePositionTxContext',
    functionName: 'useCheckLPApprovalQuery',
    extra: { canBatchTransactions, delegatedAddress },
  })

  const { gasFeeToken0Approval, gasFeeToken1Approval, gasFeeToken0Permit, gasFeeToken1Permit } = approvalCalldata ?? {}
  const gasFeeToken0USD = useUSDCurrencyAmountOfGasFee(poolOrPair?.chainId, gasFeeToken0Approval)
  const gasFeeToken1USD = useUSDCurrencyAmountOfGasFee(poolOrPair?.chainId, gasFeeToken1Approval)
  const gasFeeToken0PermitUSD = useUSDCurrencyAmountOfGasFee(poolOrPair?.chainId, gasFeeToken0Permit)
  const gasFeeToken1PermitUSD = useUSDCurrencyAmountOfGasFee(poolOrPair?.chainId, gasFeeToken1Permit)

  const nativeTokenBalance = useMemo(() => {
    if (protocolVersion !== ProtocolVersion.V4) {
      return undefined
    }
    // Only set native token balance if the token0 is the native token
    // other tokens (CELO) are not treated as native tokens
    if (currencyMaxAmounts?.TOKEN0?.currency.isNative) {
      return currencyMaxAmounts.TOKEN0.quotient.toString()
    }
    return undefined
  }, [protocolVersion, currencyMaxAmounts])

  const isApprovalSimEnabled = useIsLiquidityApprovalSimulationEnabled(poolOrPair?.chainId)

  const createCalldataQueryParams = useMemo(() => {
    return generateLiquidityServiceCreateCalldataQueryParams({
      address: smartPoolAddress ?? evmAddress,
      approvalCalldata,
      positionState,
      protocolVersion,
      creatingPoolOrPair,
      displayCurrencies: currencies.display,
      ticks,
      poolOrPair,
      currencyAmounts,
      independentField: depositState.exactField,
      slippageTolerance: nativeTokenBalance && !isSlippageDirty ? undefined : customSlippageTolerance,
      customDeadline,
      nativeTokenBalance,
      poolId,
      isSmartPool: !!smartPoolAddress,
      isApprovalSimEnabled,
    })
  }, [
    evmAddress,
    smartPoolAddress,
    approvalCalldata,
    currencyAmounts,
    creatingPoolOrPair,
    ticks,
    poolOrPair,
    poolId,
    positionState,
    depositState.exactField,
    customSlippageTolerance,
    isSlippageDirty,
    currencies.display,
    protocolVersion,
    customDeadline,
    nativeTokenBalance,
    isApprovalSimEnabled,
  ])

  const isUserCommittedToCreate =
    currentTransactionStep?.step.type === TransactionStepType.IncreasePositionTransaction ||
    currentTransactionStep?.step.type === TransactionStepType.IncreasePositionTransactionAsync

  const isQueryEnabled =
    !isUserCommittedToCreate &&
    !inputError &&
    !transactionError &&
    !approvalLoading &&
    !approvalError &&
    !invalidRange &&
    // Either approval data is present, or no approval check was needed (smart pools skip it)
    (Boolean(approvalCalldata) || !addLiquidityApprovalParams) &&
    Boolean(createCalldataQueryParams)

  const { createCalldata, createError, createRefetch } = useCreatePositionQuery({
    createCalldataQueryParams,
    transactionError: !!transactionError,
    isQueryEnabled,
  })

  useEffect(() => {
    setRefetch(() => (approvalError ? approvalRefetch : createError ? createRefetch : undefined)) // this must set it as a function otherwise it will actually call createRefetch immediately
  }, [
    approvalError,
    createError,
    createCalldataQueryParams,
    addLiquidityApprovalParams,
    setTransactionError,
    setRefetch,
    createRefetch,
    approvalRefetch,
  ])

  useEffect(() => {
    setTransactionError(getErrorMessageToDisplay({ approvalError, calldataError: createError }))
  }, [approvalError, createError])

  useLogLiquidityTxError({
    error: createError,
    defaultTitle: 'unknown CreateLpPositionCalldataQuery',
    file: 'CreatePositionTxContext',
    functionName: 'useCreatePositionQuery',
    extra: { canBatchTransactions, delegatedAddress },
    onError: (message) => {
      if (createCalldataQueryParams) {
        sendAnalyticsEvent(InterfaceEventName.CreatePositionFailed, {
          message,
          // oxlint-disable-next-line typescript/no-misused-spread -- biome-parity: oxlint is stricter here
          ...createCalldataQueryParams,
        })
      }
    },
  })

  const hookRejectsLiquidity = useHookRejectsLiquidity({
    createError,
    creatingPoolOrPair,
    protocolVersion,
    poolOrPair,
    hook: positionState.hook,
  })

  const dependentAmountFallback = useCreatePositionDependentAmountFallback({
    queryParams: createCalldataQueryParams,
    isQueryEnabled: isQueryEnabled && Boolean(createError),
    exactField: depositState.exactField,
  })

  const effectiveGasFee = createCalldata?.gasFee ?? preEstimatedGasFee
  const {
    token0Approval,
    token1Approval,
    positionTokenApproval,
    v4BatchPermitData: permitData,
    token0Cancel,
    token1Cancel,
    token0PermitTransaction,
    token1PermitTransaction,
  } = approvalCalldata ?? {}
  const needsApprovals = Boolean(
    permitData ||
    token0Approval ||
    token1Approval ||
    positionTokenApproval ||
    token0Cancel ||
    token1Cancel ||
    token0PermitTransaction ||
    token1PermitTransaction,
  )
  const { displayValue: calculatedGasFee } = useTransactionGasFee({
    tx: createCalldata?.create,
    skip: !!effectiveGasFee || needsApprovals || !!smartPoolAddress,
    urgency: LP_GAS_URGENCY,
  })
  const increaseGasFeeUsd = useUSDCurrencyAmountOfGasFee(
    toSupportedChainId(createCalldata?.create?.chainId) ?? undefined,
    effectiveGasFee || calculatedGasFee,
  )

  const lastKnownGasFeeRef = useRef<CurrencyAmount<Currency> | undefined>(undefined)
  const totalGasFee = useMemo(() => {
    const fees = [gasFeeToken0USD, gasFeeToken1USD, increaseGasFeeUsd, gasFeeToken0PermitUSD, gasFeeToken1PermitUSD]
    const currentFee = fees.reduce((total, fee) => {
      if (fee && total) {
        return total.add(fee)
      }
      return total || fee
    })

    // Keep the last known value if current is undefined
    if (currentFee) {
      lastKnownGasFeeRef.current = currentFee
    }

    return currentFee || lastKnownGasFeeRef.current
  }, [gasFeeToken0USD, gasFeeToken1USD, increaseGasFeeUsd, gasFeeToken0PermitUSD, gasFeeToken1PermitUSD])

  const txInfo = useMemo(() => {
    return generateCreatePositionTxRequest({
      protocolVersion,
      approvalCalldata,
      createCalldata,
      createCalldataQueryParams:
        createCalldataQueryParams instanceof CreatePositionRequest ? createCalldataQueryParams : undefined,
      currencyAmounts,
      poolOrPair: protocolVersion === ProtocolVersion.V2 ? poolOrPair : undefined,
      canBatchTransactions,
      delegatedAddress,
      smartPoolAddress: smartPoolAddress ?? undefined,
      account,
    })
  }, [
    approvalCalldata,
    createCalldata,
    createCalldataQueryParams,
    currencyAmounts,
    poolOrPair,
    protocolVersion,
    canBatchTransactions,
    delegatedAddress,
    smartPoolAddress,
    account,
  ])

  useDynamicNativeSlippage({
    nativeTokenBalance,
    slippage: createCalldata instanceof CreatePositionResponse ? createCalldata.slippage : undefined,
    isSlippageDirty,
  })

  const dependentAmount = useMemo(() => {
    if (createError && dependentAmountFallback) {
      return dependentAmountFallback
    }
    if (createCalldata instanceof CreateClassicPositionResponse) {
      return createCalldata.dependentToken?.amount
    }
    const dependentField =
      depositState.exactField === PositionField.TOKEN0 ? createCalldata?.token1 : createCalldata?.token0
    return dependentField?.amount
  }, [createCalldata, createError, dependentAmountFallback, depositState.exactField])

  const value = useMemo(
    (): CreatePositionTxContextType => ({
      txInfo,
      gasFeeEstimateUSD: totalGasFee,
      transactionError,
      setTransactionError,
      dependentAmount,
      currencyAmounts,
      inputError,
      formattedAmounts,
      currencyAmountsUSDValue,
      currencyBalances,
      preEstimatedGasFee,
      hookRejectsLiquidity,
    }),
    [
      txInfo,
      totalGasFee,
      transactionError,
      dependentAmount,
      currencyAmounts,
      inputError,
      formattedAmounts,
      currencyAmountsUSDValue,
      currencyBalances,
      preEstimatedGasFee,
      hookRejectsLiquidity,
    ],
  )

  return <CreatePositionTxContext.Provider value={value}>{children}</CreatePositionTxContext.Provider>
}

export const useCreatePositionTxContext = (): CreatePositionTxContextType => {
  const context = useContext(CreatePositionTxContext)
  if (!context) {
    throw new Error('`useCreatePositionTxContext` must be used inside of `CreatePositionTxContextProvider`')
  }

  return context
}

import { BigNumber } from '@ethersproject/bignumber'
import { Interface } from '@ethersproject/abi'
import { UniverseChainId } from '@universe/chains'
import { useCallback, useMemo } from 'react'
import { getAddress, walletActions } from 'viem'
import {
  HL_MIN_ORDER_USD,
  HL_SPOT_USDC_SYSTEM_ADDRESS,
  HL_USDC_TOKEN_INDEX,
} from 'uniswap/src/features/chains/evm/info/hyperevm'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from '~/connection/wagmiConfig'
import { isValidHexString } from '@universe/encoding'
import { RPC_PROVIDERS } from '~/constants/providers'
import { useSelectChain } from '~/connection/hooks/useSelectChain'
import { usePortfolioAddress } from '~/pages/Portfolio/hooks/usePortfolioAddress'
import {
  buildLimitOrderAction,
  buildSpotSendAction,
  buildUsdClassTransferAction,
  formatHlPrice,
  HL_TIF,
  randomCloid,
  RIGOBLOCK_HYPERLIQUID_ABI,
  toHlPx,
  toHlSz,
  usdToCoreWei,
  usdToEvmUnits,
  usdToPerpUnits,
  usdToSizeRaw,
} from '~/pages/Portfolio/Perps/hyperliquid/hlAdapterAbi'
import { fetchHlAllMids } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'
import { useTransactionAdderFromHash } from '~/state/transactions/adder'
import { calculateGasMargin } from '~/utils/calculateGasMargin'
import { WrongChainError } from '~/utils/errors'

/** Hardcoded 1% bound for IOC market orders around the allMids mid, same safety choice as the agentic-operator. */
const HL_MARKET_ORDER_SLIPPAGE_PCT = 0.01

/**
 * Fallback gas for AHyperliquid adapter calls when local estimation fails. sendRawAction
 * forwards to Hyperliquid's CoreWriter (order placement / USD-class transfer / spot send),
 * which is far heavier than a plain ERC-20 transfer — 1M covers it with headroom.
 */
const HL_ADAPTER_GAS_FALLBACK = 1_000_000

export type HyperliquidOrderAction = 'increase' | 'decrease' | 'close' | 'open'

export interface HyperliquidOrderInput {
  action: HyperliquidOrderAction
  /** Coin symbol (e.g. "BTC") — needed to resolve the mid price for market orders. */
  coin?: string
  /** Core perp asset index (= meta universe index). */
  assetIndex: number
  /** Market szDecimals, from meta. */
  szDecimals: number
  /** true when the order buys the base asset (opens/increases a long or closes/decreases a short). */
  isBuy: boolean
  /** Order size in USD. */
  sizeUsd: number
  /** Limit price for GTC limit orders; omit for an IOC market order at mid ±1%. */
  limitPrice?: number
  reduceOnly?: boolean
  /**
   * Exact 1e8-scale size (from HyperliquidPosition.sizeRaw) for full closes; when set it
   * is used verbatim so the position fully closes and the $10 minimum is exempted.
   */
  sizeRaw?: string
}

/**
 * Builds and sends Hyperliquid CoreWriter actions through the smart pool's
 * AHyperliquid adapter (HyperEVM). The caller must be the pool operator and the
 * wallet must be on HyperEVM. Mirrors useGmxOrderCallback.
 */
export function useHyperliquidOrderCallback(poolAddress?: string): {
  // async (fetches allMids for market orders), so the promise itself may resolve undefined
  sendHlOrder: (input: HyperliquidOrderInput) => Promise<string | undefined>
  sendHlDeposit: (amountUsd: number) => Promise<string> | undefined
  sendHlUsdClassTransfer: (amountUsd: number) => Promise<string> | undefined
  sendHlSpotSend: (amountUsd: number) => Promise<string> | undefined
} {
  const account = usePortfolioAddress()
  const addTransaction = useTransactionAdderFromHash()
  const selectChain = useSelectChain()

  const executeAdapterCall = useCallback(
    async ({ functionName, args }: { functionName: 'deposit' | 'sendRawAction'; args: unknown[] }): Promise<string> => {
      if (!poolAddress) {
        throw new Error('Pool address is required')
      }
      if (!account.address) {
        throw new Error('Account address is required')
      }

      // Switch to HyperEVM if needed
      const switchChainResult = await selectChain(UniverseChainId.HyperEvm)
      if (!switchChainResult) {
        throw new WrongChainError()
      }

      // Encode the calldata PURELY (no provider) and send it RAW through the wagmi connector
      // client (viem) — the same pattern as useHyperliquidBridgeCallback. The previous ethers
      // Contract+signer path broke on MetaMask mobile: the signer ran eth_estimateGas /
      // eth_sendTransaction through the wallet transport, which MetaMask's in-app provider
      // rejected with "Invalid parameters: must provide an Ethereum address" when modifying
      // a position (Nov 2026). viem with an explicit gas only calls eth_sendTransaction.
      const data = new Interface(RIGOBLOCK_HYPERLIQUID_ABI).encodeFunctionData(functionName, args)

      logger.info(
        'useHyperliquidOrderCallback',
        'executeAdapterCall',
        `Sending ${functionName} on pool ${poolAddress}`,
        { tags: { file: 'useHyperliquidOrderCallback', function: 'executeAdapterCall' } },
      )

      // Estimate gas LOCALLY via RPC_PROVIDERS on the raw calldata (EOA→vault, same as the
      // bridge/saga pattern). Estimating through the wallet provider is both the MetaMask-
      // mobile failure mode and a gateway round-trip that cannot simulate EOA→vault txs.
      // RPC_PROVIDERS covers every EVM chain id, HyperEVM included.
      const localProvider = RPC_PROVIDERS[UniverseChainId.HyperEvm]
      let gasLimit: BigNumber
      try {
        const estimatedGas = await localProvider.estimateGas({
          from: getAddress(account.address),
          to: getAddress(poolAddress),
          data,
          value: '0',
        })
        gasLimit = BigNumber.from(calculateGasMargin(estimatedGas.toBigInt()))
      } catch (gasError) {
        const gasErrorMsg = gasError instanceof Error ? gasError.message : String(gasError)
        if (
          gasErrorMsg.includes('execution reverted') ||
          gasErrorMsg.includes('UNPREDICTABLE_GAS_LIMIT') ||
          gasErrorMsg.includes('cannot estimate gas')
        ) {
          // Revert-class failures carry the reason so the modal can show it; a tx that
          // cannot be estimated would revert on-chain.
          throw new Error(`Hyperliquid order would revert on HyperEVM: ${gasErrorMsg}`)
        }
        logger.warn(
          'useHyperliquidOrderCallback',
          'executeAdapterCall',
          'Local gas estimation failed, using fallback',
          { error: gasError },
        )
        gasLimit = BigNumber.from(HL_ADAPTER_GAS_FALLBACK)
      }

      if (!isValidHexString(data)) {
        throw new Error('Hyperliquid adapter calldata is not valid hex data')
      }
      const client = (await getConnectorClient(wagmiConfig)).extend(walletActions)
      const hash = await client.sendTransaction({
        to: getAddress(poolAddress),
        data,
        gas: gasLimit.toBigInt(),
      })

      addTransaction(
        { hash, chainId: UniverseChainId.HyperEvm },
        {
          type: TransactionType.ClaimUni, // TODO: replace with a Hyperliquid-specific type
          recipient: account.address,
        },
      )
      return hash
    },
    [account.address, addTransaction, poolAddress, selectChain],
  )

  const sendHlOrder = useCallback(
    async (input: HyperliquidOrderInput): Promise<string | undefined> => {
      if (!poolAddress) {
        return undefined
      }

      const reduceOnly = input.reduceOnly === true
      const isExactClose = !!input.sizeRaw

      // $10 minimum notional, exact closes exempt (mirrors the agentic-operator)
      if (input.sizeUsd < HL_MIN_ORDER_USD && !isExactClose) {
        throw new Error(`Hyperliquid orders must be at least $${HL_MIN_ORDER_USD}`)
      }

      let limitPx: bigint
      let tif: (typeof HL_TIF)[keyof typeof HL_TIF]
      if (input.limitPrice && input.limitPrice > 0) {
        tif = HL_TIF.gtc
        limitPx = toHlPx(formatHlPrice(input.limitPrice, input.szDecimals))
      } else {
        // IOC market order at mid ∓ 1%: buys cap above the mid, sells floor below it
        const mids = await fetchHlAllMids()
        const mid = Number(mids[input.coin ?? ''])
        if (!Number.isFinite(mid) || mid <= 0) {
          throw new Error(`No mid price available for this market`)
        }
        const boundedPrice = input.isBuy
          ? mid * (1 + HL_MARKET_ORDER_SLIPPAGE_PCT)
          : mid * (1 - HL_MARKET_ORDER_SLIPPAGE_PCT)
        tif = HL_TIF.ioc
        limitPx = toHlPx(formatHlPrice(boundedPrice, input.szDecimals))
      }

      // sz on the 1e8 wire scale: exact closes use the position's raw size verbatim;
      // otherwise convert USD notional → quantum-truncated base size at the order price
      const humanPrice = Number(limitPx) / 10 ** 8
      const sz = isExactClose
        ? BigInt(input.sizeRaw as string)
        : toHlSz(usdToSizeRaw(input.sizeUsd, { price: humanPrice, szDecimals: input.szDecimals }), input.szDecimals)

      const payload = buildLimitOrderAction({
        asset: input.assetIndex,
        isBuy: input.isBuy,
        limitPx,
        sz,
        reduceOnly,
        tif,
        cloid: randomCloid(),
      })

      return executeAdapterCall({ functionName: 'sendRawAction', args: [payload] })
    },
    [executeAdapterCall, poolAddress],
  )

  const sendHlDeposit = useCallback(
    (amountUsd: number): Promise<string> | undefined => {
      if (!poolAddress) {
        return undefined
      }
      return executeAdapterCall({ functionName: 'deposit', args: [usdToEvmUnits(amountUsd), 0] })
    },
    [executeAdapterCall, poolAddress],
  )

  const sendHlUsdClassTransfer = useCallback(
    (amountUsd: number): Promise<string> | undefined => {
      if (!poolAddress) {
        return undefined
      }
      const payload = buildUsdClassTransferAction(usdToPerpUnits(amountUsd))
      return executeAdapterCall({ functionName: 'sendRawAction', args: [payload] })
    },
    [executeAdapterCall, poolAddress],
  )

  const sendHlSpotSend = useCallback(
    (amountUsd: number): Promise<string> | undefined => {
      if (!poolAddress) {
        return undefined
      }
      const payload = buildSpotSendAction({
        destination: HL_SPOT_USDC_SYSTEM_ADDRESS,
        token: HL_USDC_TOKEN_INDEX,
        amountWei: usdToCoreWei(amountUsd),
      })
      return executeAdapterCall({ functionName: 'sendRawAction', args: [payload] })
    },
    [executeAdapterCall, poolAddress],
  )

  return useMemo(
    () => ({ sendHlOrder, sendHlDeposit, sendHlUsdClassTransfer, sendHlSpotSend }),
    [sendHlOrder, sendHlDeposit, sendHlUsdClassTransfer, sendHlSpotSend],
  )
}

import { defaultAbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { UniverseChainId } from '@universe/chains'
import { isValidHexString } from '@universe/encoding'
import { useCallback } from 'react'
import { SmartPoolBridgeError } from 'uniswap/src/features/transactions/errors'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { getAddress, walletActions } from 'viem'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from '~/connection/wagmiConfig'
import { RPC_PROVIDERS } from '~/constants/providers'
import { useSelectChain } from '~/hooks/useSelectChain'
import { usePortfolioAddress } from '~/pages/Portfolio/hooks/usePortfolioAddress'
import { HYPERLIQUID_BRIDGE_USDC } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'
import { useTransactionAdderFromHash } from '~/state/transactions/adder'
import { calculateGasMargin } from '~/utils/calculateGasMargin'
import { WrongChainError } from '~/utils/errors'

/** Across SpokePool depositV3 selector — the "standard" calldata we build before rewriting for the vault. */
const ACROSS_DEPOSIT_V3_SELECTOR = '0x7b939232'

/** The vault overwrites fillDeadline on-chain; quoteTimestamp + 6h is the Across default. */
const FILL_DEADLINE_SECONDS = 21_600

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Same fallback as swapSaga.estimateBridgeGas, used when local estimation fails for a non-revert reason. */
const RIGOBLOCK_BRIDGE_GAS_FALLBACK = 2_750_000

const ACROSS_PARAMS_TYPES = [
  'address', // depositor
  'address', // recipient
  'address', // inputToken
  'address', // outputToken
  'uint256', // inputAmount
  'uint256', // outputAmount
  'uint256', // destinationChainId
  'address', // exclusiveRelayer
  'uint32', // quoteTimestamp
  'uint32', // fillDeadline
  'uint32', // exclusivityDeadline
  'bytes', // message
]

/**
 * Builds a standard Across SpokePool depositV3 calldata (selector 0x7b939232) for a
 * pool-to-pool USDC bridge leg. depositor/recipient are the pool (they get overridden by
 * modifyAcrossDepositV3ForSmartPool anyway), exclusiveRelayer is zero and message is empty.
 */
export function buildStandardAcrossDepositV3Calldata(params: {
  poolAddress: string
  inputToken: string
  outputToken: string
  inputAmount: BigNumber
  outputAmount: BigNumber
  destinationChainId: number
  quoteTimestamp: number
}): string {
  const encoded = defaultAbiCoder.encode(ACROSS_PARAMS_TYPES, [
    getAddress(params.poolAddress),
    getAddress(params.poolAddress),
    getAddress(params.inputToken),
    getAddress(params.outputToken),
    params.inputAmount,
    params.outputAmount,
    params.destinationChainId,
    ZERO_ADDRESS,
    params.quoteTimestamp,
    params.quoteTimestamp + FILL_DEADLINE_SECONDS,
    0,
    '0x',
  ])
  return ACROSS_DEPOSIT_V3_SELECTOR + encoded.slice(2)
}

/**
 * Submits a pre-built Rigoblock vault depositV3 calldata (from
 * modifyAcrossDepositV3ForSmartPool) on the vault address, after switching the wallet to
 * the source chain. The calldata is sent RAW: it is already Rigoblock-flavored — selector
 * 0x770d096f + a SINGLE tuple(address,address,address,address,uint256,uint256,uint256,
 * address,uint32,uint32,uint32,bytes) param, produced by encodeRigoblockDepositV3 in
 * bridgeCalldata.ts. That selector/encoding deliberately differs from Across's own
 * depositV3 (0x7b939232, separate params): the Across SpokePool is compiled with viaIR,
 * RigoBlock contracts are not, so the vault ABI takes the tuple form. Do NOT re-encode it
 * as Across-style separate params and do NOT swap the selector. (The pre-fix code decoded
 * this calldata into the tuple and re-encoded it through an ethers Contract ABI — a
 * byte-identical round-trip, verified, which is why sending the raw bytes is equivalent.)
 */
export function useHyperliquidBridgeCallback(poolAddress?: string): {
  sendBridgeTransaction: (input: { sourceChainId: UniverseChainId; calldata: string }) => Promise<string | undefined>
} {
  const account = usePortfolioAddress()
  const addTransaction = useTransactionAdderFromHash()
  const selectChain = useSelectChain()

  const sendBridgeTransaction = useCallback(
    async (input: { sourceChainId: UniverseChainId; calldata: string }): Promise<string | undefined> => {
      if (!poolAddress) {
        throw new Error('Pool address is required')
      }
      if (!account.address) {
        throw new Error('Account address is required')
      }
      if (!HYPERLIQUID_BRIDGE_USDC[input.sourceChainId]) {
        throw new Error(`Chain ${input.sourceChainId} is not a supported bridge source chain`)
      }

      // The wallet must be on the source chain to send the source-side depositV3.
      const switchChainResult = await selectChain(input.sourceChainId)
      if (!switchChainResult) {
        throw new WrongChainError()
      }

      // Send through the wagmi connector client (viem), NOT the ethers Web3Provider
      // signer: the signer's sendTransaction unconditionally calls eth_blockNumber
      // before broadcasting and runs BigNumber.from on the result, which the wallet
      // transport resolves to undefined through the gateway — the bare
      // "invalid BigNumber value" error fires before any wallet popup. viem with an
      // explicit `gas` skips eth_estimateGas entirely and only calls eth_chainId
      // (already exercised by getConnectorClient) plus eth_sendTransaction.
      const client = (await getConnectorClient(wagmiConfig)).extend(walletActions)

      logger.info(
        'useHyperliquidBridgeCallback',
        'sendBridgeTransaction',
        `Sending depositV3 bridge on pool ${poolAddress} from chain ${input.sourceChainId}`,
        { tags: { file: 'useHyperliquidBridgeCallback', function: 'sendBridgeTransaction' } },
      )

      // Estimate gas LOCALLY via RPC_PROVIDERS on the raw calldata. Estimating through the
      // wallet-connected provider sends eth_estimateGas to the gateway, which cannot simulate
      // an EOA→vault tx (it returns result=undefined → "bad result from backend / invalid
      // BigNumber value"). Same pattern as swapSaga.estimateBridgeGas. Revert-class failures
      // are thrown so the modal can show the reason; anything else falls back to a fixed limit.
      const localProvider =
        input.sourceChainId in RPC_PROVIDERS
          ? RPC_PROVIDERS[input.sourceChainId as keyof typeof RPC_PROVIDERS]
          : undefined
      let gasLimit: BigNumber
      try {
        if (!localProvider) {
          throw new Error('no local provider')
        }
        const estimatedGas = await localProvider.estimateGas({
          from: getAddress(account.address),
          to: getAddress(poolAddress),
          data: input.calldata,
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
          let userMessage = 'Bridge transaction would revert on the source chain. '
          if (gasErrorMsg.includes('0xd99e07af')) {
            userMessage =
              "Bridge amount is too small: the output amount after fees is below the protocol's " +
              'minimum threshold (OutputAmountTooLow). Please increase the transfer amount.'
          } else if (gasErrorMsg.includes('0x0f6e887f')) {
            userMessage =
              'The pool is temporarily unable to process bridge transfers (EffectiveSupplyTooLow). ' +
              'Please try again later.'
          } else {
            userMessage +=
              'The pool may be in a temporary invalid state or the amount is not supported. ' +
              'Please try again later or use a different route.'
          }
          throw new SmartPoolBridgeError(userMessage)
        }
        logger.warn(
          'useHyperliquidBridgeCallback',
          'sendBridgeTransaction',
          'Local gas estimation failed, using fallback',
          {
            error: gasError,
          },
        )
        gasLimit = BigNumber.from(RIGOBLOCK_BRIDGE_GAS_FALLBACK)
      }

      let hash: string
      try {
        if (!isValidHexString(input.calldata)) {
          throw new SmartPoolBridgeError('Bridge calldata is not valid hex data')
        }
        hash = await client.sendTransaction({
          to: getAddress(poolAddress),
          data: input.calldata,
          gas: gasLimit.toBigInt(),
        })
      } catch (sendError) {
        const sendErrorMsg = sendError instanceof Error ? sendError.message : String(sendError)
        logger.warn('useHyperliquidBridgeCallback', 'sendBridgeTransaction', 'Bridge transaction send failed', {
          error: sendError,
        })
        throw new SmartPoolBridgeError(`Failed to send the bridge transaction: ${sendErrorMsg}`)
      }

      addTransaction(
        { hash, chainId: input.sourceChainId },
        {
          type: TransactionType.ClaimUni, // TODO: replace with a bridge-specific type
          recipient: account.address,
        },
      )
      return hash
    },
    [account.address, addTransaction, poolAddress, selectChain],
  )

  return { sendBridgeTransaction }
}

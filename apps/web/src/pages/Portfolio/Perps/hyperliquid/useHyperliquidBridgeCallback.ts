import { defaultAbiCoder } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { TransactionResponse } from '@ethersproject/providers'
import { UniverseChainId } from '@universe/chains'
import { useCallback } from 'react'
import { SmartPoolBridgeError } from 'uniswap/src/features/transactions/errors'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from '~/connection/wagmiConfig'
import { RPC_PROVIDERS } from '~/constants/providers'
import { clientToProvider } from '~/hooks/useEthersProvider'
import { useSelectChain } from '~/hooks/useSelectChain'
import { usePortfolioAddress } from '~/pages/Portfolio/hooks/usePortfolioAddress'
import { HYPERLIQUID_BRIDGE_USDC } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidBridgeConfig'
import { useTransactionAdder } from '~/state/transactions/hooks'
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

const ACROSS_PARAMS_TUPLE = `tuple(${[
  'address depositor',
  'address recipient',
  'address inputToken',
  'address outputToken',
  'uint256 inputAmount',
  'uint256 outputAmount',
  'uint256 destinationChainId',
  'address exclusiveRelayer',
  'uint32 quoteTimestamp',
  'uint32 fillDeadline',
  'uint32 exclusivityDeadline',
  'bytes message',
].join(',')})`

const RIGOBLOCK_VAULT_BRIDGE_ABI = [`function depositV3(${ACROSS_PARAMS_TUPLE} acrossParams)`]

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
 * the source chain. Mirrors useHyperliquidOrderCallback: connector client → ethers
 * signer → estimateGas + calculateGasMargin → addTransaction.
 */
export function useHyperliquidBridgeCallback(poolAddress?: string): {
  sendBridgeTransaction: (input: { sourceChainId: UniverseChainId; calldata: string }) => Promise<string | undefined>
} {
  const account = usePortfolioAddress()
  const addTransaction = useTransactionAdder()
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

      // Use the connected wallet client directly, mirroring useHyperliquidOrderCallback.
      const client = await getConnectorClient(wagmiConfig)
      const provider = clientToProvider(client)
      if (!provider) {
        throw new Error('Failed to get wallet provider')
      }

      const signer = provider.getSigner(account.address)
      const vaultContract = new Contract(getAddress(poolAddress), RIGOBLOCK_VAULT_BRIDGE_ABI, signer)

      // Decode the pre-encoded Rigoblock depositV3 calldata back into the AcrossParams
      // tuple so we can go through the typed Contract call path.
      const acrossParams = defaultAbiCoder.decode([ACROSS_PARAMS_TUPLE], `0x${input.calldata.slice(10)}`)[0]

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

      const response = (await vaultContract.depositV3(acrossParams, { gasLimit })) as TransactionResponse

      addTransaction(response, {
        type: TransactionType.ClaimUni, // TODO: replace with a bridge-specific type
        recipient: account.address,
      })
      return response.hash
    },
    [account.address, addTransaction, poolAddress, selectChain],
  )

  return { sendBridgeTransaction }
}

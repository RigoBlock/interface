import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { Contract } from '@ethersproject/contracts'
import { TransactionResponse } from '@ethersproject/providers'
import { useCallback, useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from '~/components/Web3Provider/wagmiConfig'
import { useAccount } from '~/hooks/useAccount'
import { clientToProvider } from '~/hooks/useEthersProvider'
import useSelectChain from '~/hooks/useSelectChain'
import { RIGOBLOCK_GMX_ABI } from '~/pages/Portfolio/Perps/gmx/abi'
import { GmxClaimableFunding } from '~/pages/Portfolio/Perps/gmx/useGmxClaimableFundingFees'
import { useTransactionAdder } from '~/state/transactions/hooks'
import { calculateGasMargin } from '~/utils/calculateGasMargin'
import { WrongChainError } from '~/utils/errors'

/**
 * Claims accumulated GMX funding fees for the smart pool through the Rigoblock
 * AGmxV2 adapter (delegatecall, same flow as order callbacks). The caller must be the
 * pool operator and the wallet must be on Arbitrum. Note: the adapter currently
 * reverts on Arbitrum due to unannounced GMX breaking changes — expected, do not
 * work around.
 */
export function useGmxClaimFundingFeesCallback(poolAddress?: string): {
  sendGmxClaimFundingFees: (claims: GmxClaimableFunding[]) => Promise<string>
} {
  const account = useAccount()
  const addTransaction = useTransactionAdder()
  const selectChain = useSelectChain()

  const sendGmxClaimFundingFees = useCallback(
    async (claims: GmxClaimableFunding[]): Promise<string> => {
      if (!poolAddress) {
        throw new Error('Pool address is required')
      }
      if (!account.address) {
        throw new Error('Account address is required')
      }
      if (claims.length === 0) {
        throw new Error('No claimable funding fees')
      }

      // Switch to the correct chain if needed
      const switchChainResult = await selectChain(UniverseChainId.ArbitrumOne)
      if (!switchChainResult) {
        throw new WrongChainError()
      }

      // Use the connected wallet client directly, mirroring the standard transaction flow.
      // Do NOT use a hook-derived public provider here: that would forward eth_sendTransaction
      // to a read-only RPC and fail in production.
      const client = await getConnectorClient(wagmiConfig)
      const provider = clientToProvider(client)
      if (!provider) {
        throw new Error('Failed to get wallet provider')
      }

      const signer = provider.getSigner(account.address)
      const gmxContract = new Contract(getAddress(poolAddress), RIGOBLOCK_GMX_ABI, signer)

      // The adapter zips the parallel arrays 1:1; receiver is ignored (forced to pool).
      const markets = claims.map((claim) => getAddress(claim.market))
      const tokens = claims.map((claim) => getAddress(claim.token))
      const receiver = getAddress(poolAddress)

      logger.info(
        'useGmxClaimFundingFeesCallback',
        'sendGmxClaimFundingFees',
        `Claiming funding fees for ${markets.length} market/token pairs`,
        { tags: { file: 'useGmxClaimFundingFeesCallback', function: 'sendGmxClaimFundingFees' } },
      )

      const estimatedGasLimit = (await gmxContract.estimateGas.claimFundingFees(
        markets,
        tokens,
        receiver,
      )) as BigNumber
      const response = (await gmxContract.claimFundingFees(markets, tokens, receiver, {
        gasLimit: calculateGasMargin(estimatedGasLimit),
      })) as TransactionResponse

      addTransaction(response, {
        // TODO: replace with a GMX-specific type; TransactionType lives in upstream packages/uniswap
        type: TransactionType.ClaimUni,
        recipient: account.address,
      })
      return response.hash
    },
    [account.address, addTransaction, poolAddress, selectChain],
  )

  return useMemo(() => ({ sendGmxClaimFundingFees }), [sendGmxClaimFundingFees])
}

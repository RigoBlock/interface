import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { logger } from 'utilities/src/logger/logger'
import { useReadContract } from 'wagmi'
import { assume0xAddress } from '~/utils/wagmi'

const KYC_PROVIDER_ABI = [
  {
    type: 'function',
    name: 'isWhitelistedUser',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const

interface UseIsUserWhitelistedParams {
  kycProvider: string | undefined
  userAddress: string | undefined
  chainId: number | undefined
}

/**
 * Checks whether a wallet is whitelisted by a smart pool's KYC provider (Rigoblock IKyc).
 * Returns undefined while loading, when the pool has no KYC provider (mints unrestricted), or
 * when the whitelist check itself reverts — e.g. the operator pointed kycProvider at a contract
 * that does not implement isWhitelistedUser. In that last case mint would revert anyway (the
 * pool performs the same check on-chain), so we fail open: the Buy button stays visible and the
 * mint simulation in BuyModal surfaces the decoded revert reason instead of hiding the pool.
 * Burns never require whitelisting.
 */
export function useIsUserWhitelisted({
  kycProvider,
  userAddress,
  chainId,
}: UseIsUserWhitelistedParams): boolean | undefined {
  const isKycEnforced = Boolean(kycProvider) && kycProvider !== ZERO_ADDRESS
  const { data, error } = useReadContract({
    abi: KYC_PROVIDER_ABI,
    address: isKycEnforced ? assume0xAddress(kycProvider) : undefined,
    functionName: 'isWhitelistedUser',
    args: userAddress ? [assume0xAddress(userAddress)] : undefined,
    chainId,
    query: { enabled: isKycEnforced && Boolean(userAddress) && Boolean(chainId) },
  })
  if (error) {
    logger.warn(
      'useKycWhitelist',
      'useIsUserWhitelisted',
      `KYC provider ${kycProvider} on chain ${chainId} does not implement isWhitelistedUser; treating whitelist state as unknown`,
      error,
    )
    return undefined
  }
  return data
}

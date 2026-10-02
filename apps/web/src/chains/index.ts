import { createContracts, createTransactions, createUtilities } from '@universe/chains'
import { FeatureFlags, getFeatureFlag } from '@universe/gating'

const ctx = { getViemEnabled: () => getFeatureFlag(FeatureFlags.ViemEnabled) }

export const {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  isAddress,
  namehash,
  parseEther,
  parseUnits,
  toBigInt,
  zeroAddress,
} = createUtilities(ctx)
export const { signTypedData } = createTransactions(ctx)
export const { createContract } = createContracts(ctx)

export { assume0xAddress } from '@universe/chains'
export type {
  Abi,
  Address,
  Block,
  ChainContract,
  Hash,
  MarginAccountAbi,
  MarginRouterAbi,
  Permit2Abi,
  SignableMessage,
  V4QuoterAbi,
  WethAbi,
} from '@universe/chains'
export {
  ensPublicResolverAbi,
  ensRegistrarAbi,
  erc20Abi,
  erc20Abi_bytes32,
  erc721Abi,
  feeOnTransferDetectorAbi,
  marginAccountAbi,
  marginRouterAbi,
  permit2Abi,
  v4QuoterAbi,
  wethAbi,
} from '@universe/chains'

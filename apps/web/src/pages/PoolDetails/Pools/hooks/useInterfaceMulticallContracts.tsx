import { MULTICALL_ADDRESSES } from '@uniswap/sdk-core'
import MulticallJSON from '@uniswap/v3-periphery/artifacts/contracts/lens/UniswapInterfaceMulticall.sol/UniswapInterfaceMulticall.json'
import { UniverseChainId } from '@universe/chains'
import { UniswapInterfaceMulticall } from 'uniswap/src/abis/types/v3'
import { ContractMap, useContractMultichain } from '~/pages/PoolDetails/Pools/hooks/useContractMultichain'

export function useInterfaceMulticallContracts(chainIds: UniverseChainId[]): ContractMap<UniswapInterfaceMulticall> {
  return useContractMultichain<UniswapInterfaceMulticall>({
    addressMap: MULTICALL_ADDRESSES,
    ABI: MulticallJSON.abi,
    chainIds,
  })
}

/* eslint-disable max-lines */
import { defaultAbiCoder, Interface } from '@ethersproject/abi'
import { isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { GOVERNANCE_PROXY_ADDRESSES, RB_REGISTRY_ADDRESSES, STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import { useAccount } from 'hooks/useAccount'
import { useContract } from 'hooks/useContract'
import { useEthersWeb3Provider } from 'hooks/useEthersProvider'
import JSBI from 'jsbi'
import { useCallback, useMemo } from 'react'
import { VoteOption } from 'state/governance/types'
import { useLogs } from 'state/logs/hooks'
import { useTransactionAdder } from 'state/transactions/hooks'
import GOVERNANCE_RB_ABI from 'uniswap/src/abis/governance.json'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import RB_REGISTRY_ABI from 'uniswap/src/abis/rb-registry.json'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import STAKING_PROXY_ABI from 'uniswap/src/abis/staking-proxy.json'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { calculateGasMargin } from 'utils/calculateGasMargin'
import { assume0xAddress } from 'utils/wagmi'
import type { Abi } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'

function useGovernanceProxyContract(): Contract | null {
  const { chainId } = useAccount()
  return useContract({
    address: chainId ? GOVERNANCE_PROXY_ADDRESSES[chainId] : undefined,
    ABI: GOVERNANCE_RB_ABI,
    withSignerIfPossible: true,
  })
}

function useRegistryContract(): Contract | null {
  const { chainId } = useAccount()
  return useContract({
    address: chainId ? RB_REGISTRY_ADDRESSES[chainId] : undefined,
    ABI: RB_REGISTRY_ABI,
    withSignerIfPossible: true,
  })
}

export function useStakingContract(): Contract | null {
  const { chainId } = useAccount()
  return useContract({
    address: chainId ? STAKING_PROXY_ADDRESSES[chainId] : undefined,
    ABI: STAKING_ABI,
    withSignerIfPossible: true,
  })
}

export function useStakingProxyContract(): Contract | null {
  const { chainId } = useAccount()
  return useContract({
    address: chainId ? STAKING_PROXY_ADDRESSES[chainId] : undefined,
    ABI: STAKING_PROXY_ABI,
    withSignerIfPossible: true,
  })
}

export function usePoolExtendedContract(poolAddress: string | undefined): Contract | null {
  return useContract({ address: poolAddress, ABI: POOL_EXTENDED_ABI, withSignerIfPossible: true })
}

// TODO: update structs interfaces
interface ProposalDetail {
  target: string
  functionSig: string
  callData: string
}

export interface ProposalData {
  id: string
  title: string
  description: string
  proposer: string
  status: ProposalState
  forCount: CurrencyAmount<Token>
  againstCount: CurrencyAmount<Token>
  startBlock: number
  endBlock: number
  eta: BigNumber
  details: ProposalDetail[]
  governorIndex: number // index in the governance address array for which this proposal pertains
}

interface ProposedAction {
  target: string
  data: string
  value: number
}

export interface CreateProposalData {
  actions: ProposedAction[]
  description: string
}

export enum StakeStatus {
  UNDELEGATED = 0,
  DELEGATED = 1,
}

interface StakeInfo {
  status: StakeStatus
  poolId: string
}

export interface StakeData {
  amount: string
  pool: string | null
  fromPoolId?: string
  poolId: string
  poolContract?: Contract | null
  stakingPoolExists?: boolean
  isPoolMoving?: boolean
}

export enum ProposalState {
  UNDETERMINED = -1,
  PENDING = 0,
  ACTIVE = 1,
  CANCELED = 2,
  QUALIFIED = 3,
  DEFEATED = 4,
  SUCCEEDED = 5,
  QUEUED = 6,
  EXPIRED = 7,
  EXECUTED = 8,
}

const GovernanceInterface = new Interface(GOVERNANCE_RB_ABI)

// get count of all proposals made in the latest governor contract
function useProposalCount(contract: Contract | null): number | undefined {
  const { data } = useReadContract({
    address: contract ? assume0xAddress(contract.address) : undefined,
    abi: GOVERNANCE_RB_ABI as Abi,
    functionName: 'proposalCount',
    chainId: contract?.chainId,
  })

  return data ? Number(data) : undefined
}

interface FormattedProposalLog {
  description: string
  actions: ProposedAction[]
  proposer: string
  proposalId: number
  startBlockOrTime: number
  endBlockOrTime: number
}

const FOUR_BYTES_DIR: { [sig: string]: string } = {
  '0x5ef2c7f0': 'setSubnodeRecord(bytes32,bytes32,address,address,uint64)',
  '0x10f13a8c': 'setText(bytes32,string,string)',
  '0xb4720477': 'sendMessageToChild(address,bytes)',
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x7b1837de': 'fund(address,uint256)',
  '0x332f6465': 'setAdapter(address,bool)',
  '0xd784d426': 'setImplementation(address)',
  '0x83f94db7': 'upgradeImplementation(address)',
  '0x42f1181e': 'addAuthorizedAddress(address)',
  '0x37b006a6': 'detachStakingContract()',
  '0x66615d56': 'attachStakingContract(address)',
  '0x70712939': 'removeAuthorizedAddress(address)',
  '0xf2fde38b': 'transferOwnership(address)',
  '0xc14b8e9c': 'updateThresholds(uint256,uin256)',
  '0x3f4350a5': 'upgradeStrategy(address)',
  '0xa91ee0dc': 'setRegistry(address)',
  '0x7a9e5e4b': 'setAuthority(address)',
  '0xb516e6e1': 'setRigoblockDao(address)',
  '0xc91b0149': 'setWhitelister(address,bool)',
  '0x13af4035': 'setOwner(address)',
  '0x71013c10': 'setFactory(address)',
  '0xcd29d473': 'addMethod(bytes4,address)',
  '0xd9efcc1e': 'removeMethod(bytes4,address)',
}

/**
 * Need proposal events to get description data emitted from
 * new proposal event.
 */
function useFormattedProposalCreatedLogs({
  contract,
  indices,
  fromBlock,
  toBlock,
}: {
  contract: Contract | null
  indices: number[][]
  fromBlock?: number
  toBlock?: number
}): FormattedProposalLog[] | undefined {
  // create filters for ProposalCreated events
  const filter = useMemo(() => {
    const filter = contract?.filters.ProposalCreated()
    if (!filter) {
      return undefined
    }
    return {
      ...filter,
      fromBlock,
      toBlock,
    }
  }, [contract, fromBlock, toBlock])

  const useLogsResult = useLogs(filter)

  return useMemo(() => {
    return (
      useLogsResult.logs
        ?.map((log: { topics: string[]; data: string }) => {
          const parsed = GovernanceInterface.parseLog(log).args
          return parsed
        })
        //.filter((parsed: any) => indices.flat().some((i) => i === parsed.proposalId))
        .map((parsed: any) => {
          const description: string = parsed.description
          const proposer = parsed.proposer.toString()
          const proposalId = parsed.proposalId

          return {
            proposer,
            description,
            proposalId,
            startBlockOrTime: parseInt(parsed.startBlockOrTime?.toString()),
            endBlockOrTime: parseInt(parsed.startBlockOrTime?.toString()),
            actions: parsed.actions,
            details: parsed.actions.map((action: ProposedAction) => {
              let calldata = action.data

              const fourbyte = calldata.slice(0, 10)
              const sig = FOUR_BYTES_DIR[fourbyte]
              if (!sig) {
                throw new Error('Missing four byte sig')
              }
              const [name, types] = sig.substring(0, sig.length - 1).split('(')
              calldata = `0x${calldata.slice(10)}`

              const decoded = defaultAbiCoder.decode(types.split(','), calldata)
              return {
                target: action.target,
                functionSig: name,
                callData: decoded.join(', '),
              }
            }),
          }
        })
    )
  }, [useLogsResult])
}

function countToIndices(count: number | undefined, skip = 0) {
  return typeof count === 'number' ? new Array(count - skip).fill(0).map((_, i) => [i + 1 + skip]) : []
}

// get data for all past and active proposals
export function useAllProposalData(): {
  data: ProposalData[]
  userVotingPower?: CurrencyAmount<Token>
  proposalThreshold?: CurrencyAmount<Token>
  loading: boolean
} {
  const account = useAccount()
  const { address, chainId } = account
  const gov = useGovernanceProxyContract()

  const proposalCount = useProposalCount(gov)

  const govProposalIndexes = useMemo(() => {
    return countToIndices(proposalCount)
  }, [proposalCount])

  // TODO: we can query all proposals by calling proposals()
  const proposalCalls = useMemo(() => {
    return govProposalIndexes.flatMap((index) => [
      {
        address: assume0xAddress(gov?.address),
        abi: GOVERNANCE_RB_ABI as Abi,
        functionName: 'getProposalById' as const,
        args: index as readonly unknown[],
        chainId,
      },
      {
        address: assume0xAddress(gov?.address),
        abi: GOVERNANCE_RB_ABI as Abi,
        functionName: 'getProposalState' as const,
        args: index as readonly unknown[],
        chainId,
      },
    ])
  }, [gov?.address, govProposalIndexes, chainId])

  const votingPowerCall = [
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'getVotingPower' as const,
      args: [assume0xAddress(address)],
      chainId,
    },
  ]

  const govParamsCall = [
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'governanceParameters' as const,
      chainId,
    },
  ]

  const { data: combinedData, isFetching } = useReadContracts({
    contracts: [...votingPowerCall, ...govParamsCall, ...proposalCalls],
    query: {
      enabled: !!gov?.address && !!govProposalIndexes,
    },
  })

  const { mergedData, votingPower, govParams } = useMemo(() => {
    if (!combinedData || isFetching) {
      return { mergedData: undefined, votingPower: undefined }
    }
    const result: any[] = []
    const votingPowerNumber = combinedData[0]?.result

    for (let i = 2; i < combinedData.length; i += 2) {
      const proposalData = combinedData[i].result
      if (proposalData && typeof proposalData === 'object') {
        result.push({
          ...proposalData,
          state: combinedData[i + 1].result,
        })
      }
    }

    return {
      mergedData: result,
      votingPower: JSBI.BigInt(votingPowerNumber?.toString() ?? 0),
      govParams: combinedData[1]?.result as any,
    }
  }, [combinedData, isFetching])

  // get metadata from past events
  let govStartBlock

  // TODO: deploy on Sepolia
  if (chainId === UniverseChainId.Mainnet) {
    govStartBlock = 16620590
  } else if (chainId === UniverseChainId.Sepolia) {
    govStartBlock = 6921639
  } else if (chainId === UniverseChainId.ArbitrumOne) {
    govStartBlock = 60590354
  } else if (chainId === UniverseChainId.Optimism) {
    govStartBlock = 74115128
  } else if (chainId === UniverseChainId.Polygon) {
    govStartBlock = 39249858
  } else if (chainId === UniverseChainId.Base) {
    govStartBlock = 2570523 //typeof blockNumber === 'number' ? blockNumber - 4000 : blockNumber
  } else if (chainId === UniverseChainId.Bnb) {
    govStartBlock = 29095808 //typeof blockNumber === 'number' ? blockNumber - 4000 : blockNumber
  } else if (chainId === UniverseChainId.Unichain) {
    govStartBlock = 16121684 // TODO: update with correct block number once governance is deployed
  }

  // Notice: logs are proxied through our rpc endpoint
  const formattedLogsV1 = useFormattedProposalCreatedLogs({
    contract: gov,
    indices: govProposalIndexes,
    fromBlock: govStartBlock,
  })
  const grg = useMemo(() => (chainId ? GRG[chainId] : undefined), [chainId])
  const userVotingPower = grg && votingPower ? CurrencyAmount.fromRawAmount(grg, votingPower) : undefined
  const proposalThreshold =
    grg && govParams?.params?.proposalThreshold !== undefined
      ? CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(govParams.params.proposalThreshold.toString()))
      : undefined

  // early return until events are fetched
  return useMemo(() => {
    // early return if no proposals (i.e. fresh governance contract)
    if (govProposalIndexes.length === 0) {
      return { data: [], userVotingPower, proposalThreshold, loading: false }
    }

    const formattedLogs = [...(formattedLogsV1 ?? [])]

    if (!grg || isFetching || formattedLogs.length === 0 || !mergedData || mergedData.length === 0) {
      return { data: [], userVotingPower, proposalThreshold, loading: true }
    }

    return {
      data: mergedData.map(({ proposal, proposedAction, state }, i) => {
        const startBlock = parseInt(proposal.startBlockOrTime?.toString())

        const description = formattedLogs[i]?.description
        const title = description.split(/#+\s|\n/g)[1]

        const details = proposedAction.map((action: ProposedAction) => {
          let calldata = action.data

          const fourbyte = calldata.slice(0, 10)
          const sig = FOUR_BYTES_DIR[fourbyte]
          if (!sig) {
            throw new Error('Missing four byte sig')
          }
          const [name, types] = sig.substring(0, sig.length - 1).split('(')
          calldata = `0x${calldata.slice(10)}`

          const decoded = types ? defaultAbiCoder.decode(types.split(','), calldata) : []
          return {
            target: action.target,
            functionSig: name,
            callData: decoded.join(', '),
          }
        })

        // TODO: amend block to time
        return {
          id: (i + 1).toString(), //formattedLogs[i]?.proposalId?.toString(),
          title,
          description,
          proposer: formattedLogs[i]?.proposer, //proposal?.result?.proposer,
          status: state ?? ProposalState.UNDETERMINED,
          forCount: CurrencyAmount.fromRawAmount(grg, BigNumber.from(proposal.votesFor).toString()),
          againstCount: CurrencyAmount.fromRawAmount(grg, BigNumber.from(proposal.votesAgainst).toString()),
          startBlock,
          endBlock: parseInt(proposal.endBlockOrTime?.toString()),
          eta: BigNumber.from(0), //proposal?.result?.eta,
          details, //: formattedLogs[i]?.details,
          governorIndex: 1,
        }
      }),
      userVotingPower,
      proposalThreshold,
      loading: false,
    }
  }, [formattedLogsV1, gov, mergedData, grg, isFetching, govProposalIndexes, userVotingPower, proposalThreshold])
}

export function useVotingParams(address?: string): {
  userVotingPower?: CurrencyAmount<Token>
  proposalThreshold?: CurrencyAmount<Token>
} {
  const { chainId } = useAccount()
  const gov = useGovernanceProxyContract()

  const votingPowerCall = [
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'getVotingPower' as const,
      args: [assume0xAddress(address)],
      chainId,
    },
  ]

  const govParamsCall = [
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'governanceParameters' as const,
      chainId,
    },
  ]

  const { data: combinedData, isFetching: isLoading } = useReadContracts({
    contracts: [...votingPowerCall, ...govParamsCall],
    query: {
      enabled: !!gov?.address && !!address,
    },
  })

  return useMemo(() => {
    if (!combinedData || isLoading) {
      return { userVotingPower: undefined, proposalThreshold: undefined }
    }

    const votingPowerNumber = combinedData[0]?.result
    const votingPower = JSBI.BigInt(votingPowerNumber?.toString() ?? 0)
    const govParams = combinedData[1]?.result as any
    const grg = chainId ? GRG[chainId] : undefined

    const userVotingPower = grg && CurrencyAmount.fromRawAmount(grg, votingPower)
    const proposalThreshold =
      grg && CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(govParams?.params?.proposalThreshold.toString() ?? 0))

    return { userVotingPower, proposalThreshold }
  }, [combinedData, isLoading, chainId])
}

export function useProposalData(
  governorIndex: number,
  id: string,
): {
  data?: ProposalData
  quorumAmount?: CurrencyAmount<Token>
  isLoading?: boolean
} {
  const { chainId } = useAccount()
  const gov = useGovernanceProxyContract()
  const proposalCalls = [
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'getProposalById' as const,
      args: [id],
      chainId,
    },
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'getProposalState' as const,
      args: [id],
      chainId,
    },
    {
      address: assume0xAddress(gov?.address),
      abi: GOVERNANCE_RB_ABI as Abi,
      functionName: 'governanceParameters' as const,
      chainId,
    },
  ]

  const { data, isFetching: isLoading } = useReadContracts({
    contracts: proposalCalls,
    query: {
      enabled: !!gov?.address && !!id,
    },
  })

  // get metadata from past events
  let govStartBlock

  if (chainId === UniverseChainId.Mainnet) {
    govStartBlock = 16620590
  } else if (chainId === UniverseChainId.Sepolia) {
    govStartBlock = 6921639
  } else if (chainId === UniverseChainId.ArbitrumOne) {
    govStartBlock = 60590354
  } else if (chainId === UniverseChainId.Optimism) {
    govStartBlock = 74115128
  } else if (chainId === UniverseChainId.Polygon) {
    govStartBlock = 39249858
    govStartBlock = 16121684
  }

  const formattedLogs = useFormattedProposalCreatedLogs({
    contract: gov,
    indices: [[parseInt(id)]],
    fromBlock: govStartBlock,
  })

  const proposalData = useMemo(() => {
    if (!data || isLoading) {
      return undefined
    }
    const proposal = data[0].result as any
    const state = data[1].result
    const govParams = data[2].result as any

    return [proposal, state, govParams?.params?.quorumThreshold] as [any, any, any]
  }, [data, isLoading])

  return useMemo(() => {
    if (!proposalData || !formattedLogs || formattedLogs.length === 0) {
      return { data: undefined, quorumAmount: undefined, isLoading: true }
    }
    const [proposalResult, state, quorumThreshold] = proposalData
    const proposal = proposalResult?.proposal
    const proposedAction = proposalResult?.proposedAction || []
    const grg = chainId ? GRG[chainId] : undefined

    const quorumAmount =
      grg && quorumThreshold !== undefined
        ? CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(quorumThreshold.toString()))
        : undefined

    if (!grg || !proposal) {
      return { data: undefined, quorumAmount, isLoading: false }
    }

    const formattedLog = formattedLogs[0]
    const description = formattedLog.description
    const title = description.split(/#+\s|\n/g)[1]

    const details = proposedAction.map((action: ProposedAction) => {
      let calldata = action.data

      const fourbyte = calldata.slice(0, 10)
      const sig = FOUR_BYTES_DIR[fourbyte]
      if (!sig) {
        throw new Error('Missing four byte sig')
      }
      const [name, types] = sig.substring(0, sig.length - 1).split('(')
      calldata = `0x${calldata.slice(10)}`

      const decoded = types ? defaultAbiCoder.decode(types.split(','), calldata) : []
      return {
        target: action.target,
        functionSig: name,
        callData: decoded.join(', '),
      }
    })

    return {
      data: {
        id,
        title,
        description,
        proposer: formattedLog.proposer,
        status: state ?? ProposalState.UNDETERMINED,
        forCount: CurrencyAmount.fromRawAmount(grg, BigNumber.from(proposal.votesFor ?? 0).toString()),
        againstCount: CurrencyAmount.fromRawAmount(grg, BigNumber.from(proposal.votesAgainst ?? 0).toString()),
        startBlock: parseInt(proposal.startBlockOrTime?.toString()),
        endBlock: parseInt(proposal.endBlockOrTime?.toString()),
        eta: BigNumber.from(0),
        details,
        governorIndex,
      },
      quorumAmount,
      isLoading: false,
    }
  }, [proposalData, formattedLogs, id, chainId, governorIndex])
}

// gets the users current votes
export function useUserVotes(): { loading: boolean; votes?: CurrencyAmount<Token> } {
  const account = useAccount()
  const governance = useGovernanceProxyContract()

  // check for available votes
  const { data, isFetching: loading } = useReadContract({
    address: governance ? assume0xAddress(governance.address) : undefined,
    abi: GOVERNANCE_RB_ABI as Abi,
    functionName: 'getVotingPower' as const,
    args: [account.address],
    chainId: governance?.chainId,
    query: { enabled: !!account.address && !!governance },
  })

  return useMemo(() => {
    const grg = account.chainId ? GRG[account.chainId] : undefined
    return { loading, votes: grg && data ? CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(data.toString())) : undefined }
  }, [account.chainId, loading, data])
}

export function usePoolIdByAddress(pool: string | undefined): {
  poolId?: string
  stakingPoolExists: boolean
} {
  const registryContract = useRegistryContract()
  const { data: poolId } = useReadContract({
    address: registryContract ? assume0xAddress(registryContract.address) : undefined,
    abi: RB_REGISTRY_ABI as Abi,
    functionName: 'getPoolIdFromAddress' as const,
    args: [pool ?? undefined],
    chainId: registryContract?.chainId,
    query: { enabled: !!pool },
  })
  const stakingContract = useStakingContract()
  const { data: stakingPool } = useReadContract({
    address: stakingContract ? assume0xAddress(stakingContract.address) : undefined,
    abi: STAKING_ABI as Abi,
    functionName: 'getStakingPool' as const,
    args: [poolId ?? undefined],
    chainId: stakingContract?.chainId,
    query: { enabled: !!poolId },
  })
  const stakingPoolExists = stakingPool !== undefined ? (stakingPool as any)?.operator !== ZERO_ADDRESS : false
  if (!poolId) {
    return { poolId: undefined, stakingPoolExists }
  } else {
    return { poolId: poolId as string, stakingPoolExists }
  }
}

export function useStakeBalance(
  poolId: string | null | undefined,
  owner?: string,
): CurrencyAmount<Currency> | undefined {
  const account = useAccount()
  const grg = account.chainId ? GRG[account.chainId] : undefined
  const stakingContract = useStakingContract()
  const { data: stake } = useReadContract({
    address: stakingContract ? assume0xAddress(stakingContract.address) : undefined,
    abi: STAKING_ABI as Abi,
    functionName: 'getStakeDelegatedToPoolByOwner' as const,
    args: [owner ?? assume0xAddress(account.address), poolId ?? undefined],
    chainId: stakingContract?.chainId,
  })

  return stake && grg ? CurrencyAmount.fromRawAmount(grg, String((stake as any).nextEpochBalance)) : undefined
}

export function useDelegateCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !account.chainId || !account.address || !stakeData || !isAddress(stakeData.pool ?? '')) {
        return undefined
      }
      //if (!stakeData.amount) return
      const createPoolCall = stakingContract?.interface.encodeFunctionData('createStakingPool', [stakeData.pool])
      const stakeCall = stakingContract?.interface.encodeFunctionData('stake', [stakeData.amount])
      const fromInfo: StakeInfo = { status: StakeStatus.UNDELEGATED, poolId: stakeData.poolId }
      const toInfo: StakeInfo = { status: StakeStatus.DELEGATED, poolId: stakeData.poolId }
      const moveStakeCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        fromInfo,
        toInfo,
        stakeData.amount,
      ])
      const delegatee = stakeData.pool
      if (!delegatee) {
        return undefined
      }
      //const args = [delegatee]
      // if the staking pool does not exist, user creates it and becomes staking pal
      const args = !stakeData.stakingPoolExists
        ? [[createPoolCall, stakeCall, moveStakeCall]]
        : [[stakeCall, moveStakeCall]]
      if (!stakingProxy) {
        throw new Error('No Staking Contract!')
      }
      return stakingProxy.estimateGas.batchExecute(...args, {}).then((estimatedGasLimit) => {
        return stakingProxy
          .batchExecute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Delegate,
              delegateeAddress: delegatee,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider, stakingContract, stakingProxy],
  )
}

export function useDelegatePoolCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !account.chainId || !account.address || !stakeData || !isAddress(stakeData.pool ?? '')) {
        return undefined
      }
      //if (!stakeData.amount) return
      const delegatee = stakeData.pool
      const poolInstance = stakeData.poolContract ?? undefined
      if (!delegatee) {
        return undefined
      }
      //const args = [delegatee]
      // Rigoblock executes move stake inside stake method, in just 1 call
      const args = [stakeData.amount]
      if (!poolInstance) {
        throw new Error('No Pool Contract!')
      }
      return poolInstance.estimateGas.stake(...args, {}).then((estimatedGasLimit) => {
        return poolInstance
          .stake(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Delegate,
              delegateeAddress: delegatee,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider],
  )
}

export function useMoveStakeCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (
        !provider ||
        !account.chainId ||
        !account.address ||
        !stakeData ||
        !stakeData.fromPoolId ||
        !isAddress(stakeData.pool ?? '')
      ) {
        return undefined
      }
      //if (!stakeData.amount) return
      const createPoolCall = stakingContract?.interface.encodeFunctionData('createStakingPool', [stakeData.pool])
      // until a staking implementation upgrade, moving delegated stake requires batching from pool deactivation
      //  and to pool activation
      const deactivateFromInfo: StakeInfo = { status: StakeStatus.DELEGATED, poolId: stakeData.fromPoolId }
      const deactivateToInfo: StakeInfo = { status: StakeStatus.UNDELEGATED, poolId: stakeData.fromPoolId }
      const deactivateCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        deactivateFromInfo,
        deactivateToInfo,
        stakeData.amount,
      ])
      const activateFromInfo: StakeInfo = { status: StakeStatus.UNDELEGATED, poolId: stakeData.poolId }
      const activateToInfo: StakeInfo = { status: StakeStatus.DELEGATED, poolId: stakeData.poolId }
      const activateCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        activateFromInfo,
        activateToInfo,
        stakeData.amount,
      ])
      const delegatee = stakeData.pool
      if (!delegatee) {
        return undefined
      }
      //const args = [delegatee]
      // if the staking pool does not exist, user creates it and becomes staking pal
      const args = !stakeData.stakingPoolExists
        ? stakeData.fromPoolId !== stakeData.poolId
          ? [[createPoolCall, deactivateCall, activateCall]]
          : [[createPoolCall, activateCall]]
        : stakeData.fromPoolId !== stakeData.poolId
          ? [[deactivateCall, activateCall]]
          : [[activateCall]]
      if (!stakingProxy) {
        throw new Error('No Staking Contract!')
      }
      return stakingProxy.estimateGas.batchExecute(...args, {}).then((estimatedGasLimit) => {
        return stakingProxy
          .batchExecute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Delegate,
              delegateeAddress: delegatee,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider, stakingContract, stakingProxy],
  )
}

export function useDeactivateStakeCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !account.chainId || !account.address || !stakeData || !isAddress(stakeData.pool ?? '')) {
        return undefined
      }
      const deactivateFromInfo: StakeInfo = { status: StakeStatus.DELEGATED, poolId: stakeData.poolId }
      const deactivateToInfo: StakeInfo = { status: StakeStatus.UNDELEGATED, poolId: stakeData.poolId }
      //if (!stakeData.amount) return
      // in unstake, we use the same StakeData struct but use stakeData.poolId instead of stakeData.fromPoolId
      const deactivateCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        deactivateFromInfo,
        deactivateToInfo,
        stakeData.amount,
      ])

      const delegatee = stakeData.pool
      const poolInstance = stakeData.poolContract ?? undefined
      if (!delegatee) {
        return undefined
      }
      // Rigoblock executes move stake inside stake method, in just 1 call
      const args = stakeData.isPoolMoving ? [stakeData.amount] : [[deactivateCall]]
      if (!stakingProxy) {
        throw new Error('No Staking Contract!')
      }
      if (stakeData.isPoolMoving && !poolInstance) {
        throw new Error('No Pool Contract!')
      }
      if (stakeData.isPoolMoving && poolInstance) {
        return poolInstance.estimateGas.undelegateStake(...args, {}).then((estimatedGasLimit) => {
          return poolInstance
            .undelegateStake(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
            .then((response: TransactionResponse) => {
              // TODO: add more transaction types in store
              addTransaction(response, {
                type: TransactionType.Delegate,
                delegateeAddress: delegatee,
              })
              return response.hash
            })
        })
      }
      return stakingProxy.estimateGas.batchExecute(...args, {}).then((estimatedGasLimit) => {
        return stakingProxy
          .batchExecute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Delegate,
              delegateeAddress: delegatee,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider, stakingContract, stakingProxy],
  )
}

export function useVoteCallback(): (
  proposalId: string | undefined,
  voteOption: VoteOption,
) => undefined | Promise<string> {
  const account = useAccount()
  const latestGovernanceContract = useGovernanceProxyContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined, voteOption: VoteOption) => {
      if (!account.address || !latestGovernanceContract || !proposalId || !account.chainId) {
        return undefined
      }
      const args = [proposalId, voteOption === VoteOption.For ? 0 : voteOption === VoteOption.Against ? 1 : 2]
      return latestGovernanceContract.estimateGas.castVote(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .castVote(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Vote,
              proposalId,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, latestGovernanceContract, account.chainId],
  )
}

export function useQueueCallback(): (proposalId: string | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const latestGovernanceContract = useGovernanceProxyContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined) => {
      if (!account.address || !latestGovernanceContract || !proposalId || !account.chainId) {
        return undefined
      }
      const args = [proposalId]
      return latestGovernanceContract.estimateGas.queue(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .queue(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Queue,
              proposalId,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, latestGovernanceContract, account.chainId],
  )
}

export function useExecuteCallback(): (proposalId: string | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const latestGovernanceContract = useGovernanceProxyContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined) => {
      if (!account.address || !latestGovernanceContract || !proposalId || !account.chainId) {
        return undefined
      }
      const args = [proposalId]
      return latestGovernanceContract.estimateGas.execute(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .execute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Execute,
              proposalId,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, latestGovernanceContract, account.chainId],
  )
}

export function useCreateProposalCallback(): (
  createProposalData: CreateProposalData | undefined,
) => undefined | Promise<string> {
  const account = useAccount()
  const latestGovernanceContract = useGovernanceProxyContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (createProposalData: CreateProposalData | undefined) => {
      if (!account.address || !latestGovernanceContract || !createProposalData || !account.chainId) {
        return undefined
      }

      const args = [
        createProposalData.actions,
        //createProposalData.values,
        //createProposalData.signatures,
        //createProposalData.calldatas,
        createProposalData.description,
      ]

      return latestGovernanceContract.estimateGas.propose(...args).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .propose(...args, { gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.SubmitProposal,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, latestGovernanceContract, account.chainId],
  )
}

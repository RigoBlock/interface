import { defaultAbiCoder, Interface } from '@ethersproject/abi'
import { isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { toUtf8String, Utf8ErrorFuncs, Utf8ErrorReason } from '@ethersproject/strings'
// eslint-disable-next-line no-restricted-imports
import { t } from '@lingui/macro'
import { abi as UNI_ABI } from '@uniswap/governance/build/Uni.json'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import GOVERNANCE_RB_ABI from 'abis/governance.json'
import POOL_EXTENDED_ABI from 'abis/pool-extended.json'
import RB_POOL_FACTORY_ABI from 'abis/rb-pool-factory.json'
import RB_REGISTRY_ABI from 'abis/rb-registry.json'
import STAKING_ABI from 'abis/staking-impl.json'
import STAKING_PROXY_ABI from 'abis/staking-proxy.json'
import {
  GOVERNANCE_PROXY_ADDRESSES,
  RB_FACTORY_ADDRESSES,
  RB_REGISTRY_ADDRESSES,
  STAKING_PROXY_ADDRESSES,
} from 'constants/addresses'
import { LATEST_GOVERNOR_INDEX } from 'constants/governance'
import { ZERO_ADDRESS } from 'constants/misc'
import { POLYGON_PROPOSAL_TITLE } from 'constants/proposals/polygon_proposal_title'
import { UNISWAP_GRANTS_PROPOSAL_DESCRIPTION } from 'constants/proposals/uniswap_grants_proposal_description'
import { useContract } from 'hooks/useContract'
import { useSingleCallResult, useSingleContractMultipleData } from 'lib/hooks/multicall'
import { useCallback, useMemo } from 'react'
import { calculateGasMargin } from 'utils/calculateGasMargin'

import { SupportedChainId } from '../../constants/chains'
import {
  BRAVO_START_BLOCK,
  MOONBEAN_START_BLOCK,
  ONE_BIP_START_BLOCK,
  POLYGON_START_BLOCK,
  UNISWAP_GRANTS_START_BLOCK,
} from '../../constants/proposals'
import { GRG, UNI } from '../../constants/tokens'
import { useLogs } from '../logs/hooks'
import { useTransactionAdder } from '../transactions/hooks'
import { TransactionType } from '../transactions/types'
import { VoteOption } from './types'

function useGovernanceProxyContract(): Contract | null {
  return useContract(GOVERNANCE_PROXY_ADDRESSES, GOVERNANCE_RB_ABI, true)
}

const useLatestGovernanceContract = useGovernanceProxyContract

export function useUniContract() {
  const { chainId } = useWeb3React()
  const uniAddress = useMemo(() => (chainId ? UNI[chainId]?.address : undefined), [chainId])
  return useContract(uniAddress, UNI_ABI, true)
}

export function useRegistryContract(): Contract | null {
  return useContract(RB_REGISTRY_ADDRESSES, RB_REGISTRY_ABI, true)
}

export function useStakingContract(): Contract | null {
  return useContract(STAKING_PROXY_ADDRESSES, STAKING_ABI, true)
}

function useStakingProxyContract(): Contract | null {
  return useContract(STAKING_PROXY_ADDRESSES, STAKING_PROXY_ABI, true)
}

function usePoolFactoryContract(): Contract | null {
  return useContract(RB_FACTORY_ADDRESSES, RB_POOL_FACTORY_ABI, true)
}

export function usePoolExtendedContract(poolAddress: string | undefined): Contract | null {
  return useContract(poolAddress, POOL_EXTENDED_ABI, true)
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

export interface ProposedAction {
  target: string
  data: string
  value: string
}

export interface CreateProposalData {
  actions: ProposedAction[]
  description: string
}

// TODO: check if we are using these 2
export enum StakeStatus {
  UNDELEGATED,
  DELEGATED,
}

export interface StakeInfo {
  stakeStatus: StakeStatus
  poolId: string
}

export interface StakeData {
  amount: string | undefined
  pool: string | null
  fromPoolId?: string | undefined
  poolId: string | undefined
  poolContract?: Contract | null
  stakingPoolExists?: boolean
}

export enum ProposalState {
  UNDETERMINED = -1,
  PENDING,
  ACTIVE,
  CANCELED,
  QUALIFIED,
  DEFEATED,
  SUCCEEDED,
  QUEUED,
  EXPIRED,
  EXECUTED,
}

const GovernanceInterface = new Interface(GOVERNANCE_RB_ABI)

// get count of all proposals made in the latest governor contract
function useProposalCount(contract: Contract | null): number | undefined {
  const { result } = useSingleCallResult(contract, 'proposalCount')

  return result?.[0]?.toNumber()
}

interface FormattedProposalLog {
  description: string
  details: { target: string; functionSig: string; callData: string }[]
}

const FOUR_BYTES_DIR: { [sig: string]: string } = {
  '0x5ef2c7f0': 'setSubnodeRecord(bytes32,bytes32,address,address,uint64)',
  '0x10f13a8c': 'setText(bytes32,string,string)',
  '0xb4720477': 'sendMessageToChild(address,bytes)',
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x7b1837de': 'fund(address,uint256)',
}

/**
 * Need proposal events to get description data emitted from
 * new proposal event.
 */
function useFormattedProposalCreatedLogs(
  contract: Contract | null,
  indices: number[][],
  fromBlock?: number,
  toBlock?: number
): FormattedProposalLog[] | undefined {
  // create filters for ProposalCreated events
  const filter = useMemo(() => {
    const filter = contract?.filters?.ProposalCreated()
    if (!filter) return undefined
    return {
      ...filter,
      fromBlock,
      toBlock,
    }
  }, [contract, fromBlock, toBlock])

  const useLogsResult = useLogs(filter)

  return useMemo(() => {
    return useLogsResult?.logs
      ?.map((log) => {
        const parsed = GovernanceInterface.parseLog(log).args
        return parsed
      })
      ?.filter((parsed) => indices.flat().some((i) => i === parsed.id.toNumber()))
      ?.map((parsed) => {
        let description!: string

        const startBlock = parseInt(parsed.startBlock?.toString())
        try {
          description = parsed.description
        } catch (error) {
          // replace invalid UTF-8 in the description with replacement characters
          let onError = Utf8ErrorFuncs.replace

          // Bravo proposal reverses the codepoints for U+2018 (‘) and U+2026 (…)
          if (startBlock === BRAVO_START_BLOCK) {
            const U2018 = [0xe2, 0x80, 0x98].toString()
            const U2026 = [0xe2, 0x80, 0xa6].toString()
            onError = (reason, offset, bytes, output) => {
              if (reason === Utf8ErrorReason.UNEXPECTED_CONTINUE) {
                const charCode = [bytes[offset], bytes[offset + 1], bytes[offset + 2]].reverse().toString()
                if (charCode === U2018) {
                  output.push(0x2018)
                  return 2
                } else if (charCode === U2026) {
                  output.push(0x2026)
                  return 2
                }
              }
              return Utf8ErrorFuncs.replace(reason, offset, bytes, output)
            }
          }

          description = JSON.parse(toUtf8String(error.error.value, onError)) || ''
        }

        // some proposals omit newlines
        if (
          startBlock === BRAVO_START_BLOCK ||
          startBlock === ONE_BIP_START_BLOCK ||
          startBlock === MOONBEAN_START_BLOCK
        ) {
          description = description.replace(/ {2}/g, '\n').replace(/\d\. /g, '\n$&')
        }

        return {
          description,
          details: parsed.targets.map((target: string, i: number) => {
            const signature = parsed.signatures[i]
            let calldata = parsed.calldatas[i]
            let name: string
            let types: string
            if (signature === '') {
              const fourbyte = calldata.slice(0, 10)
              const sig = FOUR_BYTES_DIR[fourbyte] ?? 'UNKNOWN()'
              if (!sig) throw new Error('Missing four byte sig')
              ;[name, types] = sig.substring(0, sig.length - 1).split('(')
              calldata = `0x${calldata.slice(10)}`
            } else {
              ;[name, types] = signature.substring(0, signature.length - 1).split('(')
            }
            const decoded = defaultAbiCoder.decode(types.split(','), calldata)
            return {
              target,
              functionSig: name,
              callData: decoded.join(', '),
            }
          }),
        }
      })
  }, [indices, useLogsResult])
}

function countToIndices(count: number | undefined, skip = 0) {
  return typeof count === 'number' ? new Array(count - skip).fill(0).map((_, i) => [i + 1 + skip]) : []
}

// get data for all past and active proposals
export function useAllProposalData(): { data: ProposalData[]; loading: boolean } {
  const { chainId } = useWeb3React()
  const gov = useGovernanceProxyContract()

  const proposalCount = useProposalCount(gov)

  const govProposalIndexes = useMemo(() => {
    return countToIndices(proposalCount)
  }, [proposalCount])

  // TODO: we can query all proposals by calling proposals()
  //const proposals = useSingleContractMultipleData(gov, 'proposals', govProposalIndexes)
  const proposals = useSingleContractMultipleData(gov, 'getProposalById', govProposalIndexes)

  // get all proposal states
  const proposalStates = useSingleContractMultipleData(gov, 'getProposalState', govProposalIndexes)

  // get metadata from past events
  let govStartBlock

  if (chainId === SupportedChainId.MAINNET) {
    govStartBlock = 16620590
  } else if (chainId === SupportedChainId.GOERLI) {
    govStartBlock = 8485377
  } else if (chainId === SupportedChainId.ARBITRUM_ONE) {
    govStartBlock = 60590354
  } else if (chainId === SupportedChainId.OPTIMISM) {
    govStartBlock = 74115128
  } else if (chainId === SupportedChainId.POLYGON) {
    govStartBlock = 39249858
  } else if (chainId === SupportedChainId.BNB) {
    govStartBlock = 25551953
  }

  const formattedLogsV1 = useFormattedProposalCreatedLogs(gov, govProposalIndexes, govStartBlock)

  // TODO: we must use staked GRG instead
  const grg = useMemo(() => (chainId ? GRG[chainId] : undefined), [chainId])

  // early return until events are fetched
  return useMemo(() => {
    const proposalsCallData = [...proposals]
    const proposalStatesCallData = [...proposalStates]
    // TODO: check what we are doing wrong here
    const formattedLogs = [...(formattedLogsV1 ?? [])]

    if (
      !grg ||
      proposalsCallData.some((p) => p.loading) ||
      proposalStatesCallData.some((p) => p.loading) ||
      (gov && !formattedLogs)
    ) {
      return { data: [], loading: true }
    }

    return {
      data: proposalsCallData.map((proposal, i) => {
        const startBlock = parseInt(proposal?.result?.startBlock?.toString())

        let description = formattedLogs[i]?.description ?? ''
        if (startBlock === UNISWAP_GRANTS_START_BLOCK) {
          description = UNISWAP_GRANTS_PROPOSAL_DESCRIPTION
        }

        let title = description?.split(/#+\s|\n/g)[1]
        if (startBlock === POLYGON_START_BLOCK) {
          title = POLYGON_PROPOSAL_TITLE
        }

        return {
          id: proposal?.result?.id.toString(),
          title: title ?? t`Untitled`,
          description: description ?? t`No description.`,
          proposer: proposal?.result?.proposer,
          status: proposalStatesCallData[i]?.result?.[0] ?? ProposalState.UNDETERMINED,
          forCount: CurrencyAmount.fromRawAmount(grg, proposal?.result?.forVotes),
          againstCount: CurrencyAmount.fromRawAmount(grg, proposal?.result?.againstVotes),
          startBlock,
          endBlock: parseInt(proposal?.result?.endBlock?.toString()),
          eta: proposal?.result?.eta,
          details: formattedLogs[i]?.details,
          governorIndex: 0,
        }
      }),
      loading: false,
    }
  }, [formattedLogsV1, gov, proposalStates, proposals, grg])
}

export function useProposalData(governorIndex: number, id: string): ProposalData | undefined {
  const { data } = useAllProposalData()
  return data.filter((p) => p.governorIndex === governorIndex)?.find((p) => p.id === id)
}

export function useQuorum(governorIndex: number): CurrencyAmount<Token> | undefined {
  const latestGovernanceContract = useLatestGovernanceContract()
  const quorumVotes = useSingleCallResult(latestGovernanceContract, 'quorumVotes')?.result?.[0]
  const { chainId } = useWeb3React()
  const grg = useMemo(() => (chainId ? GRG[chainId] : undefined), [chainId])

  if (
    !latestGovernanceContract ||
    !quorumVotes ||
    chainId !== SupportedChainId.MAINNET ||
    !grg ||
    governorIndex !== LATEST_GOVERNOR_INDEX
  )
    return undefined

  return CurrencyAmount.fromRawAmount(grg, quorumVotes)
}

// get the users delegatee if it exists
export function useUserDelegatee(): string {
  const { account } = useWeb3React()
  const uniContract = useUniContract()
  const { result } = useSingleCallResult(uniContract, 'delegates', [account ?? undefined])
  return result?.[0] ?? undefined
}

// gets the users current votes
export function useUserVotes(): { loading: boolean; votes: CurrencyAmount<Token> | undefined } {
  const { account, chainId } = useWeb3React()
  const governance = useGovernanceProxyContract()

  // check for available votes
  const { result, loading } = useSingleCallResult(governance, 'getVotingPower', [account ?? undefined])
  return useMemo(() => {
    const grg = chainId ? GRG[chainId] : undefined
    return { loading, votes: grg && result ? CurrencyAmount.fromRawAmount(grg, result?.[0]) : undefined }
  }, [chainId, loading, result])
}

// fetch available votes as of block (usually proposal start block)
export function useUserVotesAsOfBlock(block: number | undefined): CurrencyAmount<Token> | undefined {
  const { account, chainId } = useWeb3React()
  const uniContract = useUniContract()

  // check for available votes
  const uni = useMemo(() => (chainId ? UNI[chainId] : undefined), [chainId])
  const votes = useSingleCallResult(uniContract, 'getPriorVotes', [account ?? undefined, block ?? undefined])
    ?.result?.[0]
  return votes && uni ? CurrencyAmount.fromRawAmount(uni, votes) : undefined
}

export function usePoolIdByAddress(pool: string | undefined): { poolId: string; stakingPoolExists: boolean } {
  const registryContract = useRegistryContract()
  const poolId = useSingleCallResult(registryContract ?? undefined, 'getPoolIdFromAddress', [pool ?? undefined])
    ?.result?.[0]
  const stakingContract = useStakingContract()
  const stakingPool = useSingleCallResult(stakingContract ?? undefined, 'getStakingPool', [poolId])?.result?.[0]
  const stakingPoolExists = stakingPool !== undefined ? stakingPool?.operator !== ZERO_ADDRESS : false
  return { poolId, stakingPoolExists }
}

// TODO: we must return a currency balance
export function useStakeBalance(poolId: string | null | undefined): CurrencyAmount<Currency> | undefined {
  const { account, chainId } = useWeb3React()
  const grg = chainId ? GRG[chainId] : undefined
  const stakingContract = useStakingContract()
  const stake = useSingleCallResult(stakingContract ?? undefined, 'getStakeDelegatedToPoolByOwner', [
    account,
    poolId ?? undefined,
  ])?.result?.[0]

  return stake && grg ? CurrencyAmount.fromRawAmount(grg, stake.nextEpochBalance) : undefined
}

export function useCreateCallback(): (
  name: string | undefined,
  symbol: string | undefined,
  baseCurrency: string | undefined
) => undefined | Promise<string> {
  const { account, chainId, provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const factoryContract = usePoolFactoryContract()

  return useCallback(
    (name: string | undefined, symbol: string | undefined, baseCurrency: string | undefined) => {
      //if (!provider || !chainId || !account || name === '' || symbol === '' || !isAddress(baseCurrency ?? ''))
      if (!provider || !chainId || !account || !name || !symbol || !isAddress(baseCurrency ?? '')) return undefined
      if (!factoryContract) throw new Error('No Factory Contract!')
      // TODO: check correctness of asserting is address before returning on no address
      if (!baseCurrency) return
      return factoryContract.estimateGas.createPool(name, symbol, baseCurrency, {}).then((estimatedGasLimit) => {
        return factoryContract
          .createPool(name, symbol, baseCurrency, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              // TODO: define correct transaction type
              type: TransactionType.DELEGATE,
              delegatee: baseCurrency,
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, chainId, provider, factoryContract]
  )
}

export function useDelegateCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const { account, chainId, provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !chainId || !account || !stakeData || !isAddress(stakeData.pool ?? '')) return undefined
      //if (!stakeData.amount) return
      const createPoolCall = stakingContract?.interface.encodeFunctionData('createStakingPool', [stakeData.pool])
      const stakeCall = stakingContract?.interface.encodeFunctionData('stake', [stakeData.amount])
      const fromInfo = { status: '0', poolId: stakeData.poolId }
      const toInfo = { status: '1', poolId: stakeData.poolId }
      const moveStakeCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        fromInfo,
        toInfo,
        stakeData.amount,
      ])
      const delegatee = stakeData.pool
      if (!delegatee) return
      //const args = [delegatee]
      // if the staking pool does not exist, user creates it and becomes staking pal
      const args = !stakeData.stakingPoolExists
        ? [[createPoolCall, stakeCall, moveStakeCall]]
        : [[stakeCall, moveStakeCall]]
      if (!stakingProxy) throw new Error('No Staking Contract!')
      return stakingProxy.estimateGas.batchExecute(...args, {}).then((estimatedGasLimit) => {
        return stakingProxy
          .batchExecute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.DELEGATE,
              delegatee,
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, chainId, provider, stakingContract, stakingProxy]
  )
}

export function useDelegatePoolCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const { account, chainId, provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !chainId || !account || !stakeData || !isAddress(stakeData.pool ?? '')) return undefined
      //if (!stakeData.amount) return
      const delegatee = stakeData.pool
      const poolInstance = stakeData.poolContract ?? undefined
      if (!delegatee) return
      //const args = [delegatee]
      // Rigoblock executes move stake inside stake method, in just 1 call
      const args = [stakeData.amount]
      if (!poolInstance) throw new Error('No Pool Contract!')
      return poolInstance.estimateGas.stake(...args, {}).then((estimatedGasLimit) => {
        return poolInstance
          .stake(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.DELEGATE,
              delegatee,
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, chainId, provider]
  )
}

export function useMoveStakeCallback(): (stakeData: StakeData | undefined) => undefined | Promise<string> {
  const { account, chainId, provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()

  return useCallback(
    (stakeData: StakeData | undefined) => {
      if (!provider || !chainId || !account || !stakeData || !isAddress(stakeData.pool ?? '')) return undefined
      //if (!stakeData.amount) return
      const createPoolCall = stakingContract?.interface.encodeFunctionData('createStakingPool', [stakeData.pool])
      // until a staking implementation upgrade, moving delegated stake requires batching from pool deactivation
      //  and to pool activation
      const deactivateFromInfo = { status: '1', poolId: stakeData.fromPoolId }
      const deactivateToInfo = { status: '0', poolId: stakeData.fromPoolId }
      const deactivateCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        deactivateFromInfo,
        deactivateToInfo,
        stakeData.amount,
      ])
      const activateFromInfo = { status: '0', poolId: stakeData.poolId }
      const activateToInfo = { status: '1', poolId: stakeData.poolId }
      const activateCall = stakingContract?.interface.encodeFunctionData('moveStake', [
        activateFromInfo,
        activateToInfo,
        stakeData.amount,
      ])
      const delegatee = stakeData.pool
      if (!delegatee) return
      //const args = [delegatee]
      // if the staking pool does not exist, user creates it and becomes staking pal
      const args = !stakeData.stakingPoolExists
        ? [[createPoolCall, deactivateCall, activateCall]]
        : [[deactivateCall, activateCall]]
      if (!stakingProxy) throw new Error('No Staking Contract!')
      return stakingProxy.estimateGas.batchExecute(...args, {}).then((estimatedGasLimit) => {
        return stakingProxy
          .batchExecute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.DELEGATE,
              delegatee,
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, chainId, provider, stakingContract, stakingProxy]
  )
}

export function useVoteCallback(): (
  proposalId: string | undefined,
  voteOption: VoteOption
) => undefined | Promise<string> {
  const { account, chainId } = useWeb3React()
  const latestGovernanceContract = useLatestGovernanceContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined, voteOption: VoteOption) => {
      if (!account || !latestGovernanceContract || !proposalId || !chainId) return
      const args = [proposalId, voteOption === VoteOption.Against ? 0 : voteOption === VoteOption.For ? 1 : 2]
      return latestGovernanceContract.estimateGas.castVote(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .castVote(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.VOTE,
              decision: voteOption,
              governorAddress: latestGovernanceContract.address,
              proposalId: parseInt(proposalId),
              reason: '',
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, latestGovernanceContract, chainId]
  )
}

export function useQueueCallback(): (proposalId: string | undefined) => undefined | Promise<string> {
  const { account, chainId } = useWeb3React()
  const latestGovernanceContract = useLatestGovernanceContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined) => {
      if (!account || !latestGovernanceContract || !proposalId || !chainId) return
      const args = [proposalId]
      return latestGovernanceContract.estimateGas.queue(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .queue(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.QUEUE,
              governorAddress: latestGovernanceContract.address,
              proposalId: parseInt(proposalId),
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, latestGovernanceContract, chainId]
  )
}

export function useExecuteCallback(): (proposalId: string | undefined) => undefined | Promise<string> {
  const { account, chainId } = useWeb3React()
  const latestGovernanceContract = useLatestGovernanceContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (proposalId: string | undefined) => {
      if (!account || !latestGovernanceContract || !proposalId || !chainId) return
      const args = [proposalId]
      return latestGovernanceContract.estimateGas.execute(...args, {}).then((estimatedGasLimit) => {
        return latestGovernanceContract
          .execute(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.EXECUTE,
              governorAddress: latestGovernanceContract.address,
              proposalId: parseInt(proposalId),
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, latestGovernanceContract, chainId]
  )
}

export function useCreateProposalCallback(): (
  createProposalData: CreateProposalData | undefined
) => undefined | Promise<string> {
  const { account, chainId } = useWeb3React()
  const latestGovernanceContract = useLatestGovernanceContract()
  const addTransaction = useTransactionAdder()

  return useCallback(
    (createProposalData: CreateProposalData | undefined) => {
      if (!account || !latestGovernanceContract || !createProposalData || !chainId) return undefined

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
              type: TransactionType.SUBMIT_PROPOSAL,
            })
            return response.hash
          })
      })
    },
    [account, addTransaction, latestGovernanceContract, chainId]
  )
}

export function useLatestProposalId(address: string | undefined): string | undefined {
  const latestGovernanceContract = useLatestGovernanceContract()
  const res = useSingleCallResult(latestGovernanceContract, 'latestProposalIds', [address])
  return res?.result?.[0]?.toString()
}

export function useProposalThreshold(): CurrencyAmount<Token> | undefined {
  const { chainId } = useWeb3React()

  const latestGovernanceContract = useLatestGovernanceContract()
  const res = useSingleCallResult(latestGovernanceContract, 'governanceParameters')
  const grg = useMemo(() => (chainId ? GRG[chainId] : undefined), [chainId])

  if (res?.result?.[0].params?.quorumThreshold && grg) {
    return CurrencyAmount.fromRawAmount(grg, res.result[0].params.proposalThreshold)
  }

  return undefined
}

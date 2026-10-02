import { Currency } from '@uniswap/sdk-core'
import AUTHORITY_ABI from 'uniswap/src/abis/authority.json'
import TOKEN_ABI from 'uniswap/src/abis/erc20.json'
import GOVERNANCE_RB_ABI from 'uniswap/src/abis/governance.json'
import RB_POOL_FACTORY_ABI from 'uniswap/src/abis/rb-pool-factory.json'
import STAKING_PROXY_ABI from 'uniswap/src/abis/staking-proxy.json'
import { type Abi, encodeFunctionData, getAddress } from '~/chains'
import {
  AUTHORITY_ADDRESSES,
  GOVERNANCE_PROXY_ADDRESSES,
  RB_FACTORY_ADDRESSES,
  STAKING_PROXY_ADDRESSES,
} from '~/constants/addresses'
import { tryParseCurrencyAmount } from '~/lib/utils/tryParseCurrencyAmount'
import { ProposalAction } from '~/pages/CreateProposal/ProposalActionSelector'
import { CreateProposalData } from '~/state/governance/hooks'

// TODO: verify which params to make optional
export interface ActionData {
  id: number
  proposalAction: ProposalAction
  toAddress: string
  // Undefined on chains without GRG (e.g. HyperEVM), where governance is not deployed.
  currency: Currency | undefined
  amount: string
  methods?: string[]
  values?: (string | boolean)[][]
  target?: string
}

/** Encodes the create-proposal form into the on-chain payload; returns undefined when invalid. */
export function buildCreateProposalData({
  actions,
  titleValue,
  bodyValue,
  chainId,
}: {
  actions: ActionData[]
  titleValue: string
  bodyValue: string
  chainId: number
}): CreateProposalData | undefined {
  const createProposalData: CreateProposalData = {} as CreateProposalData
  createProposalData.description = `# ${titleValue}\n\n${bodyValue}`
  createProposalData.actions = []

  for (const action of actions) {
    // TODO: verify action.currency.isToken
    if (!action.currency || !action.currency.isToken) {
      return undefined
    }
    const tokenAmount = tryParseCurrencyAmount(action.amount, action.currency)

    let calldatas: string[] = []
    let target: string = ''

    // TODO: add all governance owned methods
    switch (action.proposalAction) {
      case ProposalAction.TRANSFER_TOKEN: {
        if (!tokenAmount) {
          return undefined
        }
        calldatas = [
          encodeFunctionData({
            abi: TOKEN_ABI as Abi,
            functionName: 'transfer',
            args: [getAddress(action.toAddress), BigInt(tokenAmount.quotient.toString())],
          }),
        ]
        target = action.currency.address
        break
      }

      case ProposalAction.APPROVE_TOKEN: {
        if (!tokenAmount) {
          return undefined
        }
        calldatas = [
          encodeFunctionData({
            abi: TOKEN_ABI as Abi,
            functionName: 'approve',
            args: [getAddress(action.toAddress), BigInt(tokenAmount.quotient.toString())],
          }),
        ]
        target = action.currency.address
        break
      }

      case ProposalAction.UPGRADE_IMPLEMENTATION: {
        calldatas = [
          encodeFunctionData({
            abi: RB_POOL_FACTORY_ABI as Abi,
            functionName: 'setImplementation',
            args: [getAddress(action.toAddress)],
          }),
        ]
        target = RB_FACTORY_ADDRESSES[chainId]
        break
      }

      case ProposalAction.UPGRADE_GOVERNANCE: {
        calldatas = [
          encodeFunctionData({
            abi: GOVERNANCE_RB_ABI as Abi,
            functionName: 'upgradeImplementation',
            args: [getAddress(action.toAddress)],
          }),
        ]
        target = GOVERNANCE_PROXY_ADDRESSES[chainId]
        break
      }

      case ProposalAction.UPGRADE_STAKING: {
        const stakingProxyAddress = STAKING_PROXY_ADDRESSES[chainId]
        calldatas = [
          encodeFunctionData({
            abi: STAKING_PROXY_ABI as Abi,
            functionName: 'addAuthorizedAddress',
            args: [stakingProxyAddress],
          }),
          encodeFunctionData({ abi: STAKING_PROXY_ABI as Abi, functionName: 'detachStakingContract', args: [] }),
          encodeFunctionData({
            abi: STAKING_PROXY_ABI as Abi,
            functionName: 'attachStakingContract',
            args: [getAddress(action.toAddress)],
          }),
          encodeFunctionData({
            abi: STAKING_PROXY_ABI as Abi,
            functionName: 'removeAuthorizedAddress',
            args: [stakingProxyAddress],
          }),
        ]
        target = stakingProxyAddress
        break
      }

      // any non-empty string for the boolean value will result in adding an adapter
      case ProposalAction.ADD_ADAPTER: {
        calldatas = [
          encodeFunctionData({
            abi: AUTHORITY_ABI as Abi,
            functionName: 'setAdapter',
            args: [getAddress(action.toAddress), true],
          }),
        ]
        target = AUTHORITY_ADDRESSES[chainId]
        break
      }

      // an empty string for the boolean value will result in removing an adapter
      case ProposalAction.REMOVE_ADAPTER: {
        calldatas = [
          encodeFunctionData({
            abi: AUTHORITY_ABI as Abi,
            functionName: 'setAdapter',
            args: [getAddress(action.toAddress), false],
          }),
        ]
        target = AUTHORITY_ADDRESSES[chainId]
        break
      }
    }

    for (const data of calldatas) {
      createProposalData.actions.push({
        target,
        value: 0,
        data,
      })
    }
  }

  return createProposalData
}

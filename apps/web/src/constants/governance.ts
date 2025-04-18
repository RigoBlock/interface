import {
  GOVERNANCE_ALPHA_V0_ADDRESSES,
  GOVERNANCE_ALPHA_V1_ADDRESSES,
  GOVERNANCE_BRAVO_ADDRESSES,
  TIMELOCK_ADDRESSES,
  UNI_ADDRESSES,
} from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

import { GOVERNANCE_PROXY_ADDRESSES } from 'constants/addresses'
// TODO: remove deprecated governances

export const COMMON_CONTRACT_NAMES: Record<number, { [address: string]: string }> = {
  [UniverseChainId.Mainnet]: {
    [UNI_ADDRESSES[UniverseChainId.Mainnet]]: 'UNI',
    [TIMELOCK_ADDRESSES[UniverseChainId.Mainnet]]: 'Timelock',
    [GOVERNANCE_ALPHA_V0_ADDRESSES[UniverseChainId.Mainnet]]: 'Governance (V0)',
    [GOVERNANCE_ALPHA_V1_ADDRESSES[UniverseChainId.Mainnet]]: 'Governance (V1)',
    [GOVERNANCE_BRAVO_ADDRESSES[UniverseChainId.Mainnet]]: 'Governance',
    [GOVERNANCE_PROXY_ADDRESSES[UniverseChainId.Mainnet]]: 'Governance Proxy',
    '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e': 'ENS Registry',
    '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41': 'ENS Public Resolver',
    '0xf754A7E347F81cFdc70AF9FbCCe9Df3D826360FA': 'Franchiser Factory',
  },
}

// in PoS, ethereum block time is 12s, see https://ethereum.org/en/developers/docs/blocks/#block-time
export const DEFAULT_AVERAGE_BLOCK_TIME_IN_SECS = 12

// Block time here is slightly higher (~1s) than average in order to avoid ongoing proposals past the displayed time
export const AVERAGE_BLOCK_TIME_IN_SECS: { [chainId: number]: number } = {
  1: DEFAULT_AVERAGE_BLOCK_TIME_IN_SECS,
}

export const LATEST_GOVERNOR_INDEX = 1

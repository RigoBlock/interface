import { FACTORY_ADDRESS as V3_FACTORY_ADDRESS } from '@uniswap/v3-sdk'
import { UniverseChainId } from 'uniswap/src/types/chains'

type AddressMap = { [chainId: number]: string }

const DEFAULT_NETWORKS = [UniverseChainId.Mainnet, UniverseChainId.Goerli]

function constructSameAddressMap(address: string, additionalNetworks: UniverseChainId[] = []): AddressMap {
  return DEFAULT_NETWORKS.concat(additionalNetworks).reduce<AddressMap>((memo, chainId) => {
    memo[chainId] = address
    return memo
  }, {})
}

export const UNI_ADDRESS: AddressMap = constructSameAddressMap('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984')

export const GRG_ADDRESS: AddressMap = {
  [UniverseChainId.Mainnet]: '0x4FbB350052Bca5417566f188eB2EBCE5b19BC964',
  [UniverseChainId.Goerli]: '0x076C619e7ebaBe40746106B66bFBed731F2c1339',
  [UniverseChainId.ArbitrumOne]: '0x7F4638A58C0615037deCc86f1daE60E55fE92874',
  [UniverseChainId.Optimism]: '0xEcF46257ed31c329F204Eb43E254C609dee143B3',
  [UniverseChainId.Polygon]: '0xBC0BEA8E634ec838a2a45F8A43E7E16Cd2a8BA99',
  [UniverseChainId.Bnb]: '0x3d473C3eF4Cd4C909b020f48477a2EE2617A8e3C',
  [UniverseChainId.Base]: '0x09188484e1Ab980DAeF53a9755241D759C5B7d60',
}

export const UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS = '0x8B799381ac40b838BBA4131ffB26197C432AFe78'

export const V2_ROUTER_ADDRESS: AddressMap = constructSameAddressMap('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')

export const AUTHORITY_ADDRESSES: AddressMap = constructSameAddressMap('0xe35129A1E0BdB913CF6Fd8332E9d3533b5F41472', [
  UniverseChainId.Mainnet,
  UniverseChainId.Goerli,
  UniverseChainId.Optimism,
  UniverseChainId.ArbitrumOne,
  UniverseChainId.Polygon,
  UniverseChainId.Bnb,
  UniverseChainId.Base,
])

// celo v3 addresses
const CELO_V3_CORE_FACTORY_ADDRESSES = '0xAfE208a311B21f13EF87E33A90049fC17A7acDEc'
const CELO_V3_MIGRATOR_ADDRESSES = '0x3cFd4d48EDfDCC53D3f173F596f621064614C582'
const CELO_MULTICALL_ADDRESS = '0x633987602DE5C4F337e3DbF265303A1080324204'
const CELO_QUOTER_ADDRESSES = '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8'
const CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = '0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A'
const CELO_TICK_LENS_ADDRESSES = '0x5f115D9113F88e0a0Db1b5033D90D4a9690AcD3D'

// BNB v3 addresses
const BNB_V3_CORE_FACTORY_ADDRESSES = '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7'
const BNB_V3_MIGRATOR_ADDRESSES = '0x32681814957e0C13117ddc0c2aba232b5c9e760f'
const BNB_MULTICALL_ADDRESS = '0x963Df249eD09c358A4819E39d9Cd5736c3087184'
const BNB_QUOTER_ADDRESSES = '0x78D78E420Da98ad378D7799bE8f4AF69033EB077'
const BNB_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613'
const BNB_TICK_LENS_ADDRESSES = '0xD9270014D396281579760619CCf4c3af0501A47C'

// optimism goerli addresses
const OPTIMISM_GOERLI_V3_CORE_FACTORY_ADDRESSES = '0xB656dA17129e7EB733A557f4EBc57B76CFbB5d10'
const OPTIMISM_GOERLI_V3_MIGRATOR_ADDRESSES = '0xf6c55fBe84B1C8c3283533c53F51bC32F5C7Aba8'
const OPTIMISM_GOERLI_MULTICALL_ADDRESS = '0x07F2D8a2a02251B62af965f22fC4744A5f96BCCd'
const OPTIMISM_GOERLI_QUOTER_ADDRESSES = '0x9569CbA925c8ca2248772A9A4976A516743A246F'
const OPTIMISM_GOERLI_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = '0x39Ca85Af2F383190cBf7d7c41ED9202D27426EF6'
const OPTIMISM_GOERLI_TICK_LENS_ADDRESSES = '0xe6140Bd164b63E8BfCfc40D5dF952f83e171758e'

// arbitrum goerli v3 addresses
const ARBITRUM_GOERLI_V3_CORE_FACTORY_ADDRESSES = '0x4893376342d5D7b3e31d4184c08b265e5aB2A3f6'
const ARBITRUM_GOERLI_V3_MIGRATOR_ADDRESSES = '0xA815919D2584Ac3F76ea9CB62E6Fd40a43BCe0C3'
const ARBITRUM_GOERLI_MULTICALL_ADDRESS = '0x8260CB40247290317a4c062F3542622367F206Ee'
const ARBITRUM_GOERLI_QUOTER_ADDRESSES = '0x1dd92b83591781D0C6d98d07391eea4b9a6008FA'
const ARBITRUM_GOERLI_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = '0x622e4726a167799826d1E1D150b076A7725f5D81'
const ARBITRUM_GOERLI_TICK_LENS_ADDRESSES = '0xb52429333da969a0C79a60930a4Bf0020E5D1DE8'

/* V3 Contract Addresses */
export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap(V3_FACTORY_ADDRESS, [
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.PolygonMumbai,
    UniverseChainId.Polygon,
    UniverseChainId.Base,
  ]),
  [UniverseChainId.Celo]: CELO_V3_CORE_FACTORY_ADDRESSES,
  [UniverseChainId.CeloAlfajores]: CELO_V3_CORE_FACTORY_ADDRESSES,
  [UniverseChainId.Bnb]: BNB_V3_CORE_FACTORY_ADDRESSES,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_V3_CORE_FACTORY_ADDRESSES,
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_V3_CORE_FACTORY_ADDRESSES,
}

export const V3_MIGRATOR_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0xA5644E29708357803b5A882D272c41cC0dF92B34', [
    UniverseChainId.ArbitrumOne,
    UniverseChainId.PolygonMumbai,
    UniverseChainId.Polygon,
  ]),
  [UniverseChainId.Celo]: CELO_V3_MIGRATOR_ADDRESSES,
  [UniverseChainId.CeloAlfajores]: CELO_V3_MIGRATOR_ADDRESSES,
  [UniverseChainId.Bnb]: BNB_V3_MIGRATOR_ADDRESSES,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_V3_MIGRATOR_ADDRESSES,
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_V3_MIGRATOR_ADDRESSES,
}

export const MULTICALL_ADDRESS: AddressMap = {
  ...constructSameAddressMap('0x1F98415757620B543A52E61c46B32eB19261F984', [
    UniverseChainId.Optimism,
    UniverseChainId.PolygonMumbai,
    UniverseChainId.Polygon,
  ]),
  [UniverseChainId.ArbitrumOne]: '0xadF885960B47eA2CD9B55E6DAc6B42b7Cb2806dB',
  [UniverseChainId.Celo]: CELO_MULTICALL_ADDRESS,
  [UniverseChainId.CeloAlfajores]: CELO_MULTICALL_ADDRESS,
  [UniverseChainId.Bnb]: BNB_MULTICALL_ADDRESS,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_MULTICALL_ADDRESS,
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_MULTICALL_ADDRESS,
}

// TODO: remove uniswap addresses
/**
 * The oldest V0 governance address
 */
export const GOVERNANCE_ALPHA_V0_ADDRESSES: AddressMap = constructSameAddressMap(
  '0x5e4be8Bc9637f0EAA1A755019e06A68ce081D58F'
)
/**
 * The older V1 governance address
 */
export const GOVERNANCE_ALPHA_V1_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0xC4e172459f1E7939D522503B81AFAaC1014CE6F6',
}
/**
 * The latest governor bravo that is currently admin of timelock
 */
export const GOVERNANCE_BRAVO_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0x408ED6354d4973f66138C91495F2f2FCbd8724C3',
}

/* V1 Governance Addresses */
export const GOVERNANCE_PROXY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x5F8607739c2D2d0b57a4292868C368AB1809767a', [
    UniverseChainId.Mainnet,
    UniverseChainId.Goerli,
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.Polygon,
    UniverseChainId.Bnb,
    UniverseChainId.Base,
  ]),
}

/* Staking Proxy Addresses */
export const STAKING_PROXY_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0x730dDf7b602dB822043e0409d8926440395e07fE',
  [UniverseChainId.Goerli]: '0x6C4594aa0CBcb8315E88EFdb11675c09A7a5f444',
  [UniverseChainId.Optimism]: '0xB844bDCC64a748fDC8c9Ee74FA4812E4BC28FD70',
  [UniverseChainId.ArbitrumOne]: '0xD495296510257DAdf0d74846a8307bf533a0fB48',
  [UniverseChainId.Polygon]: '0xC87d1B952303ae3A9218727692BAda6723662dad',
  [UniverseChainId.Bnb]: '0xa4a94cCACa8ccCdbCD442CF8eECa0cd98f69e99e',
  [UniverseChainId.Base]: '0xc758Ea84d6D978fe86Ee29c1fbD47B4F302F1992',
}

/* GRG Transfer Proxy Addresses */
export const GRG_TRANSFER_PROXY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x28891F41eA506Ba7eA3Be9f2075AB0aa8b81dD29', [
    UniverseChainId.Mainnet,
    UniverseChainId.Goerli,
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.Polygon,
    UniverseChainId.Bnb,
    UniverseChainId.Base,
  ]),
  [UniverseChainId.Mainnet]: '0x8C96182c1B2FE5c49b1bc9d9e039e369f131ED37',
}

/* Rigoblock Pool Factory Addresses */
export const RB_FACTORY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x8DE8895ddD702d9a216E640966A98e08c9228f24', [
    UniverseChainId.Mainnet,
    UniverseChainId.Goerli,
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.Polygon,
    UniverseChainId.Bnb,
    UniverseChainId.Base,
  ]),
}

/* Rigoblock Pool Registry Addresses */
export const RB_REGISTRY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x06767e8090bA5c4Eca89ED00C3A719909D503ED6', [
    UniverseChainId.Mainnet,
    UniverseChainId.Goerli,
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.Polygon,
    UniverseChainId.Bnb,
    UniverseChainId.Base,
  ]),
}

export const TIMELOCK_ADDRESS: AddressMap = constructSameAddressMap('0x1a9C8182C09F50C8318d769245beA52c32BE35BC')

export const MERKLE_DISTRIBUTOR_ADDRESS: AddressMap = {
  [UniverseChainId.Mainnet]: '0x090D4613473dEE047c3f2706764f49E0821D256e',
}

export const ARGENT_WALLET_DETECTOR_ADDRESS: AddressMap = {
  [UniverseChainId.Mainnet]: '0xeca4B0bDBf7c55E9b7925919d03CbF8Dc82537E8',
}

export const QUOTER_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6', [
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.PolygonMumbai,
    UniverseChainId.Polygon,
  ]),
  [UniverseChainId.Celo]: CELO_QUOTER_ADDRESSES,
  [UniverseChainId.CeloAlfajores]: CELO_QUOTER_ADDRESSES,
  [UniverseChainId.Bnb]: BNB_QUOTER_ADDRESSES,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_QUOTER_ADDRESSES,
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_QUOTER_ADDRESSES,
}

export const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0xC36442b4a4522E871399CD717aBDD847Ab11FE88', [
    UniverseChainId.Optimism,
    UniverseChainId.ArbitrumOne,
    UniverseChainId.PolygonMumbai,
    UniverseChainId.Polygon,
  ]),
  [UniverseChainId.Celo]: CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  [UniverseChainId.CeloAlfajores]: CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  [UniverseChainId.Bnb]: BNB_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
}

export const ENS_REGISTRAR_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  [UniverseChainId.Goerli]: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
}

export const SOCKS_CONTROLLER_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0x65770b5283117639760beA3F867b69b3697a91dd',
}

export const TICK_LENS_ADDRESSES: AddressMap = {
  [UniverseChainId.ArbitrumOne]: '0xbfd8137f7d1516D3ea5cA83523914859ec47F573',
  [UniverseChainId.ArbitrumGoerli]: ARBITRUM_GOERLI_TICK_LENS_ADDRESSES,
  [UniverseChainId.Celo]: CELO_TICK_LENS_ADDRESSES,
  [UniverseChainId.CeloAlfajores]: CELO_TICK_LENS_ADDRESSES,
  [UniverseChainId.Bnb]: BNB_TICK_LENS_ADDRESSES,
  [UniverseChainId.OptimismGoerli]: OPTIMISM_GOERLI_TICK_LENS_ADDRESSES,
}

export const POP_ADDRESSES: AddressMap = {
  [UniverseChainId.Mainnet]: '0xC3736344ee0bcE9bDe5D231060f03990b798f030',
  [UniverseChainId.Goerli]: '0x9CE56818c01bCF9bbCa533d2db4b19e85e53a000',
  [UniverseChainId.Optimism]: '0x9e895962AaceE64e42b8fFFa1efF0AcD7F0B6794',
  [UniverseChainId.ArbitrumOne]: '0xA665C2f17D0Fa2D9f1efaa587B5CF493B23751b0',
  [UniverseChainId.Polygon]: '0x4170B7d618F3E5B29b3DBdCDADd626fF3746be9A',
  [UniverseChainId.Bnb]: '0xAe1D80A6731c44eeF098D4C6Cf979f596c7cd6F7',
  [UniverseChainId.Base]: '0x979Af6DDC1562b4B6D8B2Ab60A1B7221a0d6C8DB',
}

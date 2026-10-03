import { BigNumber } from '@ethersproject/bignumber'
import { GraphQLApi } from '@universe/api'
import { UniverseChainId } from '@universe/chains'
import { AppId } from '@universe/config'
import { PollingInterval } from 'uniswap/src/constants/misc'
import { ALL_CHAIN_IDS } from 'uniswap/src/features/chains/chainInfo'
import {
  chainIdToHexadecimalString,
  fromGraphQLChain,
  fromUniswapWebAppLink,
  getEnabledChains,
  getPollingIntervalByBlocktime,
  hexadecimalStringToInt,
  toSupportedChainId,
  toUniswapWebAppLink,
} from 'uniswap/src/features/chains/utils'

describe(toSupportedChainId, () => {
  it('handles undefined input', () => {
    expect(toSupportedChainId(undefined)).toEqual(null)
  })

  it('handles unsupported chain ID', () => {
    expect(toSupportedChainId(BigNumber.from(6767))).toEqual(null)
  })

  it('handles supported chain ID', () => {
    expect(toSupportedChainId(UniverseChainId.Polygon)).toEqual(137)
  })
})

describe(fromGraphQLChain, () => {
  it('handles undefined', () => {
    expect(fromGraphQLChain(undefined)).toEqual(null)
  })

  it('handles supported chain', () => {
    expect(fromGraphQLChain(GraphQLApi.Chain.Arbitrum)).toEqual(UniverseChainId.ArbitrumOne)
    expect(fromGraphQLChain(GraphQLApi.Chain.Base)).toEqual(UniverseChainId.Base)
  })

  // Fork: chains outside the RigoBlock set (e.g. MegaETH) are commented out of
  // fromGraphQLChain and must map to null.
  it('handles chains outside the fork set', () => {
    expect(fromGraphQLChain(GraphQLApi.Chain.Megaeth)).toEqual(null)
    expect(fromGraphQLChain(GraphQLApi.Chain.Solana)).toEqual(null)
  })

  it('handles unsupported chain', () => {
    expect(fromGraphQLChain(GraphQLApi.Chain.UnknownChain)).toEqual(null)
  })
})

describe(getPollingIntervalByBlocktime, () => {
  it('returns the correct value for L1', () => {
    expect(getPollingIntervalByBlocktime(UniverseChainId.Mainnet)).toEqual(PollingInterval.Fast)
  })

  it('returns the correct value for L2', () => {
    expect(getPollingIntervalByBlocktime(UniverseChainId.Polygon)).toEqual(PollingInterval.LightningMcQueen)
  })
})

describe(fromUniswapWebAppLink, () => {
  it('handles supported chain', () => {
    expect(fromUniswapWebAppLink(GraphQLApi.Chain.Ethereum.toLowerCase())).toEqual(UniverseChainId.Mainnet)
    expect(fromUniswapWebAppLink(GraphQLApi.Chain.Arbitrum.toLowerCase())).toEqual(UniverseChainId.ArbitrumOne)
    expect(fromUniswapWebAppLink(GraphQLApi.Chain.Optimism.toLowerCase())).toEqual(UniverseChainId.Optimism)
    expect(fromUniswapWebAppLink(GraphQLApi.Chain.Polygon.toLowerCase())).toEqual(UniverseChainId.Polygon)
    expect(fromUniswapWebAppLink(GraphQLApi.Chain.Megaeth.toLowerCase())).toEqual(UniverseChainId.MegaETH)
    // TODO: add Base test once GraphQLApi.Chain includes Base (GQL reliant)
  })

  it('handle unsupported chain', () => {
    expect(() => fromUniswapWebAppLink('unkwnown')).toThrow('Network "unkwnown" can not be mapped')
  })
})

describe(toUniswapWebAppLink, () => {
  it('handles supported chain', () => {
    expect(toUniswapWebAppLink(UniverseChainId.Mainnet)).toEqual(GraphQLApi.Chain.Ethereum.toLowerCase())
    expect(toUniswapWebAppLink(UniverseChainId.ArbitrumOne)).toEqual(GraphQLApi.Chain.Arbitrum.toLowerCase())
    expect(toUniswapWebAppLink(UniverseChainId.Optimism)).toEqual(GraphQLApi.Chain.Optimism.toLowerCase())
    expect(toUniswapWebAppLink(UniverseChainId.Polygon)).toEqual(GraphQLApi.Chain.Polygon.toLowerCase())
    expect(toUniswapWebAppLink(UniverseChainId.MegaETH)).toEqual(GraphQLApi.Chain.Megaeth.toLowerCase())
    // TODO: add Base test once GraphQLApi.Chain includes Base (GQL reliant)
  })

  it('handle unsupported chain', () => {
    expect(() => fromUniswapWebAppLink('unkwnown')).toThrow('Network "unkwnown" can not be mapped')
  })
})

describe(chainIdToHexadecimalString, () => {
  it('handles supported chain', () => {
    expect(chainIdToHexadecimalString(UniverseChainId.ArbitrumOne)).toEqual('0xa4b1')
  })
})

describe('hexadecimalStringToInt', () => {
  it('converts valid hexadecimal strings to integers', () => {
    expect(hexadecimalStringToInt('1')).toEqual(1)
    expect(hexadecimalStringToInt('a')).toEqual(10)
    expect(hexadecimalStringToInt('A')).toEqual(10)
    expect(hexadecimalStringToInt('10')).toEqual(16)
    expect(hexadecimalStringToInt('FF')).toEqual(255)
    expect(hexadecimalStringToInt('ff')).toEqual(255)
    expect(hexadecimalStringToInt('100')).toEqual(256)
  })

  it('converts hexadecimal strings with prefix to integers', () => {
    expect(hexadecimalStringToInt('0x1')).toEqual(1)
    expect(hexadecimalStringToInt('0xa')).toEqual(10)
    expect(hexadecimalStringToInt('0xA')).toEqual(10)
    expect(hexadecimalStringToInt('0x10')).toEqual(16)
    expect(hexadecimalStringToInt('0xFF')).toEqual(255)
    expect(hexadecimalStringToInt('0xff')).toEqual(255)
    expect(hexadecimalStringToInt('0x100')).toEqual(256)
  })

  it('handles invalid hexadecimal strings', () => {
    expect(hexadecimalStringToInt('')).toBeNaN()
    expect(hexadecimalStringToInt('g')).toBeNaN()
    expect(hexadecimalStringToInt('0x')).toBeNaN()
    expect(hexadecimalStringToInt('0xg')).toBeNaN()
  })
})

describe('getEnabledChains', () => {
  it('returns all mainnet chains', () => {
    expect(
      getEnabledChains({ appId: AppId.Web, isTestnetModeEnabled: false, featureFlaggedChainIds: ALL_CHAIN_IDS }),
    ).toEqual({
      // Fork: allowedChains in utils.ts restricts the enabled set to the
      // RigoBlock chain set (incl. HyperEVM, excl. Solana and the long tail).
      chains: [
        UniverseChainId.Mainnet,
        UniverseChainId.Unichain,
        UniverseChainId.Polygon,
        UniverseChainId.ArbitrumOne,
        UniverseChainId.Optimism,
        UniverseChainId.Base,
        UniverseChainId.Bnb,
        UniverseChainId.HyperEvm,
      ],
      gqlChains: [
        GraphQLApi.Chain.Ethereum,
        GraphQLApi.Chain.Unichain,
        GraphQLApi.Chain.Polygon,
        GraphQLApi.Chain.Arbitrum,
        GraphQLApi.Chain.Optimism,
        GraphQLApi.Chain.Base,
        GraphQLApi.Chain.Bnb,
      ],
      defaultChainId: UniverseChainId.Mainnet,
      isTestnetModeEnabled: false,
    })
  })

  it('returns feature flagged chains', () => {
    expect(
      getEnabledChains({
        appId: AppId.Web,
        isTestnetModeEnabled: false,
        featureFlaggedChainIds: [UniverseChainId.Mainnet, UniverseChainId.Polygon],
      }),
    ).toEqual({
      chains: [UniverseChainId.Mainnet, UniverseChainId.Polygon],
      gqlChains: [GraphQLApi.Chain.Ethereum, GraphQLApi.Chain.Polygon],
      defaultChainId: UniverseChainId.Mainnet,
      isTestnetModeEnabled: false,
    })
  })

  it('returns testnet chains', () => {
    expect(
      getEnabledChains({
        appId: AppId.Web,
        isTestnetModeEnabled: true,
        featureFlaggedChainIds: ALL_CHAIN_IDS,
      }),
    ).toEqual({
      // Fork: only Sepolia is in the allowedChains set (Unichain Sepolia is not).
      chains: [UniverseChainId.Sepolia],
      gqlChains: [GraphQLApi.Chain.EthereumSepolia],
      defaultChainId: UniverseChainId.Sepolia,
      isTestnetModeEnabled: true,
    })
  })

  it('returns both mainnet and testnet chains when includeTestnets is true', () => {
    expect(
      getEnabledChains({
        appId: AppId.Web,
        includeTestnets: true,
        isTestnetModeEnabled: false,
        featureFlaggedChainIds: [
          UniverseChainId.Mainnet,
          UniverseChainId.Unichain,
          UniverseChainId.Base,
          UniverseChainId.Sepolia,
          UniverseChainId.UnichainSepolia,
        ],
      }),
    ).toEqual({
      // Fork: Unichain Sepolia is outside the allowedChains set and drops out.
      chains: [UniverseChainId.Mainnet, UniverseChainId.Unichain, UniverseChainId.Base, UniverseChainId.Sepolia],
      gqlChains: [
        GraphQLApi.Chain.Ethereum,
        GraphQLApi.Chain.Unichain,
        GraphQLApi.Chain.Base,
        GraphQLApi.Chain.EthereumSepolia,
      ],
      defaultChainId: UniverseChainId.Mainnet,
      isTestnetModeEnabled: false,
    })
  })
})

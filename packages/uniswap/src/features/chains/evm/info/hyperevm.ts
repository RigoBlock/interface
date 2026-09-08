import { ETH_LOGO, HYPERLIQUID_LOGO } from 'ui/src/assets'
import { config } from 'uniswap/src/config'
import { CHAIN_ID_TO_URL_PARAM } from 'uniswap/src/features/chains/chainUrlParam'
import {
  DEFAULT_MS_BEFORE_WARNING,
  DEFAULT_NATIVE_ADDRESS_LEGACY,
  DEFAULT_RETRY_OPTIONS,
} from 'uniswap/src/features/chains/evm/rpc'
import { buildChainTokens } from 'uniswap/src/features/chains/evm/tokens'
import { GENERIC_L2_GAS_CONFIG } from 'uniswap/src/features/chains/gasDefaults'
import {
  GqlChainId,
  NetworkLayer,
  RPCType,
  UniverseChainId,
  UniverseChainInfo,
} from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { buildUSDC } from 'uniswap/src/features/tokens/stablecoin'

// Hyperliquid (HyperEVM) constants — co-located with the chain info for consumers on apps/web.
export const HL_CHAIN_ID = 999
export const HL_INFO_API_URL = 'https://api.hyperliquid.xyz/info'

export const HL_USDC_ADDRESS = '0xb88339CB7199b77E23DB6E890353E22632Ba630f'
export const HL_SPOT_USDC_SYSTEM_ADDRESS = '0x2000000000000000000000000000000000000000'
export const HL_USDC_TOKEN_INDEX = 0
export const HL_DEFAULT_PERP_DEX = 0

export const HL_ACTION_LIMIT_ORDER = 1
export const HL_ACTION_SPOT_SEND = 6
export const HL_ACTION_USD_CLASS_TRANSFER = 7

export const HL_PERP_DECIMALS = 6
export const HL_SPOT_DECIMALS = 8
export const HL_PRICE_DECIMALS = 8
export const HL_MIN_ORDER_USD = 10

const tokens = buildChainTokens({
  stables: {
    USDC: buildUSDC(HL_USDC_ADDRESS, UniverseChainId.HyperEvm),
  },
})

export const HYPEREVM_CHAIN_INFO = {
  id: UniverseChainId.HyperEvm,
  platform: Platform.EVM,
  testnet: false,
  name: 'HyperEVM',
  assetRepoNetworkName: undefined,
  // The GraphQL API Chain enum has no Hyperliquid member; HyperEVM is not backend supported.
  backendChain: {
    chain: 'HYPERLIQUID' as unknown as GqlChainId,
    backendSupported: false,
    nativeTokenBackendAddress: undefined,
  },
  blockPerMainnetEpochForChainId: 1, // only used for time estimation (HyperEVM has 2s blocks)
  blockWaitMsBeforeWarning: DEFAULT_MS_BEFORE_WARNING,
  bridge: 'https://app.hyperliquid.xyz/',
  docs: 'https://hyperliquid.gitbook.io/hyperliquid-docs',
  elementName: ElementName.ChainHyperEvm,
  explorer: {
    name: 'HyperEVM Explorer',
    url: 'https://hyperevmscan.io/',
    apiURL: 'https://api.hyperevmscan.io',
  },
  interfaceName: 'hyperevm',
  searchAliases: ['hyperliquid', 'hl'],
  label: 'HyperEVM',
  logo: HYPERLIQUID_LOGO,
  nativeCurrency: {
    name: 'Hyperliquid',
    symbol: 'HYPE',
    decimals: 18,
    address: DEFAULT_NATIVE_ADDRESS_LEGACY,
    explorerLink: 'https://hyperevmscan.io/chart/etherprice',
    logo: ETH_LOGO, // placeholder until a HYPE logo asset is available
  },
  networkLayer: NetworkLayer.L2,
  blockTimeMs: 2000, // HyperEVM has 2s blocks
  pendingTransactionsRetryOptions: DEFAULT_RETRY_OPTIONS,
  tokens,
  statusPage: undefined,
  supportedURVersions: [], // no Universal Router deployment on HyperEVM
  supportsV4: false,
  supportsNFTs: false,
  urlParam: CHAIN_ID_TO_URL_PARAM[UniverseChainId.HyperEvm],
  rpcUrls: {
    [RPCType.Public]: {
      http: [`https://hyperliquid-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`],
    },
    [RPCType.Default]: {
      http: [`https://hyperliquid-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`],
    },
    [RPCType.Interface]: {
      http: [`https://hyperliquid-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`],
    },
    [RPCType.PublicAlt]: { http: ['https://rpc.hyperliquid.xyz/evm'] },
    [RPCType.Fallback]: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  // No verified wrapped native currency address yet.
  wrappedNativeCurrency: null,
  gasConfig: GENERIC_L2_GAS_CONFIG,
  tradingApiPollingIntervalMs: 150,
} as const satisfies UniverseChainInfo

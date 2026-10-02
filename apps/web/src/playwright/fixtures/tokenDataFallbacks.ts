// oxlint-disable-next-line no-restricted-imports -- fallback helpers need direct Playwright types
import type { APIResponse, Route } from '@playwright/test'
import { Currency } from '@uniswap/sdk-core'
import { ALL_NETWORKS_ARG, CustomRankingType, GraphQLApi } from '@universe/api'
import { normalizeTokenAddressForCache, UniverseChainId } from '@universe/chains'
import { DAI, nativeOnChain, USDC, USDT, WBTC, WRAPPED_NATIVE_CURRENCY } from 'uniswap/src/constants/tokens'
import { toGraphQLChain } from 'uniswap/src/features/chains/utils'
import { currencyIdToContractInput } from 'uniswap/src/features/dataApi/utils/currencyIdToContractInput'
import { currencyId } from 'uniswap/src/utils/currencyId'

/**
 * Deterministic responses served ONLY when the live gateway fails (non-2xx / network error) on
 * the token-metadata reads the unsearched token selector cannot render without. A live 2xx
 * always passes through untouched. Without these, gateway throttling of CI traffic collapses
 * the selector into its error state (TokenSelectorSwapList ORs the query errors together and
 * SelectorBaseList unmounts every row and section header on any of them), failing every spec
 * that picks from the unsearched list.
 *
 * Currencies come from the real constants so decimals can never drift from production values —
 * buildCurrency silently mis-scales amounts on a wrong decimals value (USDT is 6, not 18).
 */

type ContractInputLike = { chain: string; address?: string | null }

// Validation hook: the gateway-throttling condition can't be reproduced on demand, so this
// forces the fallback path to make it testable end-to-end. Read once at fixture setup (module
// load) — the deadline helper itself takes it as a parameter.
// oxlint-disable-next-line eslint-js/no-restricted-syntax -- Node-side Playwright code: process.env is the config surface here (no app getConfig())
const FORCE_TOKEN_DATA_FALLBACK = process.env.E2E_FORCE_TOKEN_DATA_FALLBACK === 'true'

// A healthy live response answers in well under this; anything slower gets the fallback
const LIVE_RESPONSE_TIMEOUT_MS = 5_000

/**
 * Forwards the routed request to the live backend, resolving undefined on failure OR after
 * timeoutMs. route.fetch has no timeout option of its own, so a hanging (not just failing)
 * gateway would otherwise stall past the 15s expect timeout before the fallback could serve.
 */
export async function fetchLiveResponseWithDeadline({
  route,
  timeoutMs,
  forceFallback,
}: {
  route: Route
  timeoutMs: number
  forceFallback: boolean
}): Promise<APIResponse | undefined> {
  if (forceFallback) {
    return undefined
  }
  const livePromise = route.fetch().catch(() => undefined)
  return Promise.race([
    livePromise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
  ])
}

/**
 * A GraphQL response is healthy only when it is 2xx AND its body parses as JSON without a
 * non-empty top-level `errors` array — gateway throttling can surface as HTTP 200 + errors.
 * A 2xx whose body doesn't parse is treated as unhealthy too (nothing servable in it).
 */
export async function isGraphqlResponseHealthy(response: APIResponse): Promise<boolean> {
  if (!response.ok()) {
    return false
  }
  try {
    const body = (await response.json()) as { errors?: unknown }
    return !(Array.isArray(body.errors) && body.errors.length > 0)
  } catch {
    return false
  }
}

/**
 * Fulfills the route with the live response when it is healthy, otherwise with the
 * deterministic fallback body. The fallback body is built OUTSIDE the fulfill try/catch on
 * purpose: a throw in a fallback builder must fail the spec loudly instead of leaving the
 * route unanswered, which only surfaces as an unrelated 15s expect timeout with no log.
 */
export async function fulfillWithFallback({
  route,
  buildFallback,
  isHealthy = async (response) => response.ok(),
  timeoutMs = LIVE_RESPONSE_TIMEOUT_MS,
}: {
  route: Route
  buildFallback: () => unknown
  isHealthy?: (response: APIResponse) => Promise<boolean>
  timeoutMs?: number
}): Promise<void> {
  const liveResponse = await fetchLiveResponseWithDeadline({
    route,
    timeoutMs,
    forceFallback: FORCE_TOKEN_DATA_FALLBACK,
  })

  if (liveResponse && (await isHealthy(liveResponse))) {
    try {
      await route.fulfill({ response: liveResponse })
    } catch (error) {
      // Page/test torn down mid-flight; nothing left to serve
      console.warn('Token data fallback fulfill error:', error)
    }
    return
  }

  const fallbackBody = buildFallback()
  try {
    await route.fulfill({ json: fallbackBody })
  } catch (error) {
    // Page/test torn down mid-flight; nothing left to serve
    console.warn('Token data fallback fulfill error:', error)
  }
}

/**
 * A TokenRankings response is healthy only when it is 2xx AND its parsed body carries at least
 * one ranking entry with a non-empty token list — gateway throttling can surface as a 2xx with
 * an empty trending list, which unmounts the trending section the specs target just like an
 * error would. A 2xx whose body doesn't parse is treated as unhealthy too (nothing servable).
 */
export async function isTokenRankingsResponseHealthy(response: APIResponse): Promise<boolean> {
  if (!response.ok()) {
    return false
  }
  try {
    const body = (await response.json()) as { tokenRankings?: Record<string, { tokens?: unknown[] }> } | null
    const rankings = body?.tokenRankings
    if (!rankings || typeof rankings !== 'object') {
      return false
    }
    return Object.values(rankings).some((ranking) => {
      const tokens = ranking.tokens
      return Array.isArray(tokens) && tokens.length > 0
    })
  } catch {
    return false
  }
}

type TokenProjectsFallbackToken = {
  __typename: 'Token'
  id: string
  address: string | null
  chain: string
  decimals: number
  name: string | null
  standard: GraphQLApi.TokenStandard
  symbol: string | null
  isBridged: boolean
  bridgedWithdrawalInfo: null
  feeData: null
  protectionInfo: null
}

type TokenProjectsFallbackResponse = {
  data: {
    tokenProjects: {
      __typename: 'TokenProject'
      id: string
      logoUrl: null
      safetyLevel: GraphQLApi.SafetyLevel
      tokens: TokenProjectsFallbackToken[]
    }[]
  }
}

const NATIVE_ADDRESS_KEY = 'native'

function contractKey(contract: ContractInputLike): string {
  return `${contract.chain}:${normalizeTokenAddressForCache(contract.address ?? null) ?? NATIVE_ADDRESS_KEY}`
}

// The common-bases set the selector always requests (useAllCommonBaseCurrencies) plus DAI.
// Kept deliberately tiny: unknown addresses get no fallback entry at all.
const KNOWN_FALLBACK_CURRENCIES: Currency[] = [
  nativeOnChain(UniverseChainId.Mainnet),
  nativeOnChain(UniverseChainId.Polygon),
  nativeOnChain(UniverseChainId.Bnb),
  nativeOnChain(UniverseChainId.Celo),
  nativeOnChain(UniverseChainId.Avalanche),
  nativeOnChain(UniverseChainId.Solana),
  nativeOnChain(UniverseChainId.Monad),
  USDC,
  USDT,
  WBTC,
  DAI,
  WRAPPED_NATIVE_CURRENCY[UniverseChainId.Mainnet],
].filter((currency): currency is Currency => Boolean(currency))

const KNOWN_BY_CONTRACT_KEY = new Map<string, Currency>(
  KNOWN_FALLBACK_CURRENCIES.map((currency) => [contractKey(currencyIdToContractInput(currencyId(currency))), currency]),
)

/**
 * Builds a TokenProjects GraphQL response covering the requested contracts that are in the
 * known-token map. Unknown contracts are omitted — with the live gateway down there is nothing
 * deterministic to serve for them, and a partial live response drops rows the same way.
 */
export function buildTokenProjectsFallbackResponse(contracts: ContractInputLike[]): TokenProjectsFallbackResponse {
  const tokenProjects = contracts.flatMap((contract) => {
    const currency = KNOWN_BY_CONTRACT_KEY.get(contractKey(contract))
    if (!currency) {
      return []
    }

    const idSuffix = `${contract.chain}-${currency.symbol}`
    return [
      {
        __typename: 'TokenProject' as const,
        id: `e2e-fallback-project-${idSuffix}`,
        logoUrl: null,
        safetyLevel: GraphQLApi.SafetyLevel.Verified,
        tokens: [
          {
            __typename: 'Token' as const,
            id: `e2e-fallback-token-${idSuffix}`,
            address: contract.address ?? null,
            chain: contract.chain,
            decimals: currency.decimals,
            name: currency.name ?? currency.symbol ?? null,
            standard: currency.isNative ? GraphQLApi.TokenStandard.Native : GraphQLApi.TokenStandard.Erc20,
            symbol: currency.symbol ?? null,
            isBridged: false,
            bridgedWithdrawalInfo: null,
            feeData: null,
            protectionInfo: null,
          },
        ],
      },
    ]
  })

  return { data: { tokenProjects } }
}

type TokenRankingsFallbackResponse = {
  tokenRankings: {
    [rankingType: string]: {
      tokens: Record<string, unknown>[]
    }
  }
}

// Trending must stay non-empty and include mainnet ETH + USDT: the TokenSelector specs assert
// the trending section header, and TDP/Wrap click token-option-1-{USDT,ETH} from this list.
const TRENDING_FALLBACK_MAINNET: Currency[] = [nativeOnChain(UniverseChainId.Mainnet), USDT, USDC, WBTC, DAI]

// Display-only; finite and > 0 is all that matters (mirrors MOCK_TOKEN_USD_PRICES in dataApi.ts)
const FALLBACK_USD_PRICE_BY_SYMBOL: Record<string, number> = {
  ETH: 3000,
  USDT: 1,
  USDC: 1,
  DAI: 1,
  WBTC: 60000,
}

/**
 * Builds a TokenRankings Connect response (proto3 JSON) with a deterministic trending list:
 * the mainnet set for ALL_NETWORKS / mainnet requests, the chain's native asset otherwise.
 */
export function buildTokenRankingsFallbackResponse(chainIdArg: string | undefined): TokenRankingsFallbackResponse {
  return {
    tokenRankings: {
      [CustomRankingType.Trending]: {
        tokens: trendingFallbackCurrencies(chainIdArg).map(toTokenRankingsStatJson),
      },
    },
  }
}

function trendingFallbackCurrencies(chainIdArg: string | undefined): Currency[] {
  if (!chainIdArg || chainIdArg === ALL_NETWORKS_ARG) {
    return TRENDING_FALLBACK_MAINNET
  }
  const chainId = Number(chainIdArg) as UniverseChainId
  if (chainId === UniverseChainId.Mainnet) {
    return TRENDING_FALLBACK_MAINNET
  }
  try {
    return [nativeOnChain(chainId)]
  } catch {
    // Unrecognized chain arg: a non-empty mainnet list still beats the selector's error state
    return TRENDING_FALLBACK_MAINNET
  }
}

function toTokenRankingsStatJson(currency: Currency): Record<string, unknown> {
  return {
    chain: toGraphQLChain(currency.chainId as UniverseChainId),
    // proto3 JSON: an omitted address is the default empty string, which the app reads as native
    ...(currency.isToken ? { address: currency.address } : {}),
    name: currency.name,
    symbol: currency.symbol,
    decimals: currency.decimals,
    safetyLevel: 'VERIFIED',
    price: { value: FALLBACK_USD_PRICE_BY_SYMBOL[currency.symbol ?? ''] ?? 1 },
    pricePercentChange1Day: { value: 0 },
    chainTokens: [],
  }
}

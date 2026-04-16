import { BigNumber } from '@ethersproject/bignumber'
import { logger } from 'utilities/src/logger/logger'

// Across SpokePool depositV3 function selector
const ACROSS_DEPOSIT_V3_SELECTOR = '0x7b939232'

// Across API for real-time relay fee queries
const ACROSS_API_URL = 'https://app.across.to/api/suggested-fees'

// CoinGecko API for token and native currency prices
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// RigoBlock pool updateUnitaryValue() selector — most gas-intensive destination op.
const UPDATE_UNITARY_VALUE_SELECTOR = '0xe7d8724e'

// Gas buffer: updateUnitaryValue is ~60-70% of total multicall cost. 1.5x covers the rest.
const DESTINATION_GAS_BUFFER_MULTIPLIER = 1.5

// Chain ID → CoinGecko coin ID for native gas tokens
const COINGECKO_NATIVE_ID: Record<number, string> = {
  1: 'ethereum',
  10: 'ethereum',
  56: 'binancecoin',
  137: 'matic-network',
  8453: 'ethereum',
  42161: 'ethereum',
  324: 'ethereum',
  81457: 'ethereum',
  130: 'ethereum',
}

// Chain ID → CoinGecko platform ID for token price queries by contract address
const COINGECKO_PLATFORM: Record<number, string> = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  8453: 'base',
  42161: 'arbitrum-one',
  324: 'zksync',
  130: 'unichain',
}

export interface AcrossRelayFeeResult {
  relayerGasFeeTotal: string
  totalRelayFeeTotal: string
  isAmountTooLow: boolean
  estimatedFillTimeSec?: number
  limits?: {
    minDeposit: string
    maxDeposit: string
    maxDepositInstant: string
    maxDepositShortDelay: string
  }
}

/**
 * Decodes the Across SpokePool depositV3 calldata into individual parameters.
 * Local copy to avoid circular dependency with bridgeCalldata.ts.
 */
function decodeAcrossParams(calldata: string): {
  inputToken: string
  outputToken: string
  inputAmount: BigNumber
  destinationChainId: BigNumber
} {
  const { AbiCoder } = require('@ethersproject/abi')
  const abiCoder = new AbiCoder()
  const decoded = abiCoder.decode(
    ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256',
     'address', 'uint32', 'uint32', 'uint32', 'bytes'],
    '0x' + calldata.slice(10),
  )
  return {
    inputToken: decoded[2],
    outputToken: decoded[3],
    inputAmount: BigNumber.from(decoded[4]),
    destinationChainId: BigNumber.from(decoded[6]),
  }
}

/**
 * Queries the Across suggested-fees API for relay fees.
 * Throws on 4xx (route not viable). Returns undefined on network/server errors.
 */
export async function queryAcrossRelayerGasFee(params: {
  originChainId: number
  calldata: string
  message?: string
  recipient?: string
}): Promise<AcrossRelayFeeResult | undefined> {
  try {
    const decoded = decodeAcrossParams(params.calldata)
    const url = new URL(ACROSS_API_URL)
    url.searchParams.set('inputToken', decoded.inputToken)
    url.searchParams.set('outputToken', decoded.outputToken)
    url.searchParams.set('originChainId', String(params.originChainId))
    url.searchParams.set('destinationChainId', decoded.destinationChainId.toString())
    url.searchParams.set('amount', decoded.inputAmount.toString())
    url.searchParams.set('allowUnmatchedDecimals', 'true')

    if (params.message) {
      url.searchParams.set('message', params.message)
    }
    if (params.recipient) {
      url.searchParams.set('recipient', params.recipient)
    }

    const response = await fetch(url.toString())
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Across API rejected bridge route (${response.status}): ${body || response.statusText}`)
      }
      logger.warn('bridgeCalldata', 'queryAcrossRelayerGasFee', 'Across API server error', {
        status: response.status, body,
      })
      return undefined
    }
    const data = await response.json()

    const result: AcrossRelayFeeResult = {
      relayerGasFeeTotal: data?.relayerGasFee?.total ?? '0',
      totalRelayFeeTotal: data?.totalRelayFee?.total ?? '0',
      isAmountTooLow: data?.isAmountTooLow === true,
      estimatedFillTimeSec: typeof data?.estimatedFillTimeSec === 'number' ? data.estimatedFillTimeSec : undefined,
      limits: data?.limits ? {
        minDeposit: String(data.limits.minDeposit ?? '0'),
        maxDeposit: String(data.limits.maxDeposit ?? '0'),
        maxDepositInstant: String(data.limits.maxDepositInstant ?? '0'),
        maxDepositShortDelay: String(data.limits.maxDepositShortDelay ?? '0'),
      } : undefined,
    }

    logger.debug('bridgeCalldata', 'queryAcrossRelayerGasFee', 'Across API response', {
      relayerGasFee: result.relayerGasFeeTotal,
      totalRelayFee: result.totalRelayFeeTotal,
      isAmountTooLow: result.isAmountTooLow,
      estimatedFillTimeSec: result.estimatedFillTimeSec,
      maxDeposit: result.limits?.maxDeposit,
      destinationChainId: decoded.destinationChainId.toString(),
    })

    return result
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Across API rejected')) {
      throw error
    }
    logger.warn('bridgeCalldata', 'queryAcrossRelayerGasFee', 'Across API request failed', { error })
    return undefined
  }
}

/** Fetches the USD price of a chain's native gas token from CoinGecko. */
export async function fetchNativeTokenPriceUSD(chainId: number): Promise<number | undefined> {
  const coinId = COINGECKO_NATIVE_ID[chainId]
  if (!coinId) {
    return undefined
  }
  try {
    const response = await fetch(`${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`)
    if (!response.ok) {
      return undefined
    }
    const data = await response.json()
    const price = data?.[coinId]?.usd
    return typeof price === 'number' && price > 0 ? price : undefined
  } catch {
    return undefined
  }
}

/** Fetches the USD price of a token by its contract address and chain from CoinGecko. */
export async function fetchTokenPriceUSD(chainId: number, tokenAddress: string): Promise<number | undefined> {
  const platform = COINGECKO_PLATFORM[chainId]
  if (!platform) {
    return undefined
  }
  try {
    const addr = tokenAddress.toLowerCase()
    const response = await fetch(
      `${COINGECKO_API}/simple/token_price/${platform}?contract_addresses=${addr}&vs_currencies=usd`,
    )
    if (!response.ok) {
      return undefined
    }
    const data = await response.json()
    const price = data?.[addr]?.usd
    return typeof price === 'number' && price > 0 ? price : undefined
  } catch {
    return undefined
  }
}

/** Estimates destination message gas by simulating updateUnitaryValue() on the pool. */
export async function estimateDestinationMessageGas(params: {
  provider: { estimateGas(tx: { to: string; data: string; from?: string }): Promise<BigNumber> }
  poolAddress: string
}): Promise<BigNumber | undefined> {
  try {
    const gasEstimate = await params.provider.estimateGas({
      to: params.poolAddress,
      data: UPDATE_UNITARY_VALUE_SELECTOR,
    })
    const buffered = gasEstimate.mul(Math.round(DESTINATION_GAS_BUFFER_MULTIPLIER * 100)).div(100)
    logger.debug('bridgeCalldata', 'estimateDestinationMessageGas', 'Destination gas estimated', {
      raw: gasEstimate.toString(), buffered: buffered.toString(), pool: params.poolAddress,
    })
    return buffered
  } catch {
    return undefined
  }
}

/** Computes message overhead compensation in output token base units from destination simulation. */
export async function computeDestinationSimulationCompensation(params: {
  provider: {
    estimateGas(tx: { to: string; data: string; from?: string }): Promise<BigNumber>
    getGasPrice(): Promise<BigNumber>
  }
  poolAddress: string
  destinationChainId: number
  outputTokenPriceUSD: number
  outputTokenDecimals: number
}): Promise<BigNumber | undefined> {
  const { provider, poolAddress, destinationChainId, outputTokenPriceUSD, outputTokenDecimals } = params

  const gasUnits = await estimateDestinationMessageGas({ provider, poolAddress })
  if (!gasUnits) {
    return undefined
  }

  let gasPrice: BigNumber
  try {
    gasPrice = await provider.getGasPrice()
  } catch {
    return undefined
  }

  const nativePriceUSD = await fetchNativeTokenPriceUSD(destinationChainId)
  if (!nativePriceUSD) {
    return undefined
  }

  const gasCostWei = gasUnits.mul(gasPrice)
  const nativePriceScaled = BigNumber.from(Math.round(nativePriceUSD * 1e8))
  const gasCostUSDScaled = gasCostWei.mul(nativePriceScaled).div(BigNumber.from(10).pow(18))
  const outputPriceScaled = BigNumber.from(Math.round(outputTokenPriceUSD * 1e8))
  const compensation = gasCostUSDScaled
    .mul(BigNumber.from(10).pow(outputTokenDecimals))
    .div(outputPriceScaled)

  logger.debug('bridgeCalldata', 'computeDestinationSimulationCompensation', 'Destination simulation result', {
    gasUnits: gasUnits.toString(), gasPrice: gasPrice.toString(), nativePriceUSD,
    gasCostWei: gasCostWei.toString(), outputTokenPriceUSD, compensation: compensation.toString(),
  })

  return compensation.gt(0) ? compensation : undefined
}

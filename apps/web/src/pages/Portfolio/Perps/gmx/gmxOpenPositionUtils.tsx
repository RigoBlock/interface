import { Trans } from 'react-i18next'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { GmxMarketInfo } from '~/pages/Portfolio/Perps/gmx/useGmxMarkets'
import { GmxPriceTicker, GmxTokenInfo } from '~/pages/Portfolio/Perps/gmx/useGmxOpenPositionMarketData'

export type PositionSide = 'long' | 'short'

export type InputError = 'market' | 'collateral' | 'size' | 'margin' | 'data' | undefined

export function getInputErrorLabel(inputError: InputError): JSX.Element | undefined {
  switch (inputError) {
    case 'market':
      return <Trans i18nKey="perps.errors.enterMarket" />
    case 'collateral':
      return <Trans i18nKey="perps.errors.enterCollateral" />
    case 'size':
      return <Trans i18nKey="perps.errors.enterSize" />
    case 'margin':
      return <Trans i18nKey="perps.errors.enterMargin" />
    case 'data':
      return <Trans i18nKey="perps.errors.marketDataUnavailable" />
    default:
      return undefined
  }
}

interface ExistingPositionArgs {
  isLong: PositionSide
  market?: GmxMarketInfo
  selectedCollateralToken: string
  positions: GmxPosition[]
}

export function findExistingPosition({
  isLong,
  market,
  selectedCollateralToken,
  positions,
}: ExistingPositionArgs): GmxPosition | undefined {
  if (!market || !selectedCollateralToken) {
    return undefined
  }
  return positions.find((position) => {
    return (
      position.isLong === (isLong === 'long') &&
      areAddressesEqual({
        addressInput1: { address: position.marketAddress, chainId: UniverseChainId.ArbitrumOne },
        addressInput2: { address: market.marketToken, chainId: UniverseChainId.ArbitrumOne },
      }) &&
      areAddressesEqual({
        addressInput1: { address: position.collateralTokenAddress, chainId: UniverseChainId.ArbitrumOne },
        addressInput2: { address: selectedCollateralToken, chainId: UniverseChainId.ArbitrumOne },
      })
    )
  })
}

export function computeGmxMarkPriceRaw(
  priceTicker: GmxPriceTicker | undefined,
  indexTokenInfo: GmxTokenInfo | undefined,
): string | undefined {
  if (!priceTicker || !indexTokenInfo) {
    return undefined
  }
  const raw = priceTicker.maxPrice || priceTicker.minPrice
  if (!raw) {
    return undefined
  }
  return (BigInt(raw) * 10n ** BigInt(indexTokenInfo.decimals)).toString()
}

export function computeGmxHumanPrice(
  priceTicker: GmxPriceTicker | undefined,
  indexTokenInfo: GmxTokenInfo | undefined,
): number | undefined {
  if (!priceTicker || !indexTokenInfo) {
    return undefined
  }
  const raw = priceTicker.maxPrice || priceTicker.minPrice
  if (!raw) {
    return undefined
  }
  return Number(BigInt(raw)) / 10 ** (30 - indexTokenInfo.decimals)
}

interface ValidateInputsArgs {
  market?: GmxMarketInfo
  selectedCollateralToken: string
  sizeUsd: string
  margin: string
  markPriceRaw?: string
  indexTokenInfo?: GmxTokenInfo
  collateralTokenInfo?: GmxTokenInfo
}

export function validateOpenPositionInputs({
  market,
  selectedCollateralToken,
  sizeUsd,
  margin,
  markPriceRaw,
  indexTokenInfo,
  collateralTokenInfo,
}: ValidateInputsArgs): InputError {
  if (!market) {
    return 'market'
  }
  if (!selectedCollateralToken) {
    return 'collateral'
  }
  if (!sizeUsd || isNaN(Number(sizeUsd)) || Number(sizeUsd) <= 0) {
    return 'size'
  }
  if (!margin || isNaN(Number(margin)) || Number(margin) <= 0) {
    return 'margin'
  }
  if (!markPriceRaw || !indexTokenInfo || !collateralTokenInfo) {
    return 'data'
  }
  return undefined
}

export function onNumericInput(value: string, setter: (value: string) => void) {
  if (/^\d*\.?\d*$/.test(value)) {
    setter(value)
  }
}

export function formatUsdPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function getGmxCollateralOptions(market: GmxMarketInfo): string[] {
  const addrs = [market.longToken, market.shortToken]
    .filter((address): address is string => !!address)
    .map((address) => normalizeTokenAddressForCache(address))
  return [...new Set(addrs)]
}

export function getGmxCollateralOptionsForMarkets(markets: GmxMarketInfo[]): string[] {
  const addrs = new Set<string>()
  for (const market of markets) {
    if (market.longToken) {
      addrs.add(normalizeTokenAddressForCache(market.longToken))
    }
    if (market.shortToken) {
      addrs.add(normalizeTokenAddressForCache(market.shortToken))
    }
  }
  return Array.from(addrs)
}

export function getGmxMarketIndexName(
  market: GmxMarketInfo,
  tokensByAddress: Map<string, GmxTokenInfo>,
): string {
  const indexToken = tokensByAddress.get(normalizeTokenAddressForCache(market.indexToken))
  if (indexToken) {
    return `${indexToken.symbol}/USD`
  }
  const bracketIndex = market.name.indexOf(' [')
  return bracketIndex >= 0 ? market.name.slice(0, bracketIndex) : market.name
}

export function getGmxMarketsByIndexName(
  markets: GmxMarketInfo[],
  tokensByAddress: Map<string, GmxTokenInfo>,
): Map<string, GmxMarketInfo[]> {
  const map = new Map<string, GmxMarketInfo[]>()
  for (const market of markets) {
    const indexName = getGmxMarketIndexName(market, tokensByAddress)
    const arr = map.get(indexName) ?? []
    arr.push(market)
    map.set(indexName, arr)
  }
  return map
}

export function findMarketByCollateral(
  markets: GmxMarketInfo[],
  collateralToken: string,
): GmxMarketInfo | undefined {
  const normalizedCollateral = normalizeTokenAddressForCache(collateralToken)
  return markets.find((market) => {
    const long = market.longToken ? normalizeTokenAddressForCache(market.longToken) : undefined
    const short = market.shortToken ? normalizeTokenAddressForCache(market.shortToken) : undefined
    return long === normalizedCollateral || short === normalizedCollateral
  }) ?? markets[0]
}

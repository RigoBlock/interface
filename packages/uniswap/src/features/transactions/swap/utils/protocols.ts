import { TradingApi } from '@universe/api'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useMemo } from 'react'

// RigoBlock: the fork routes swaps classic-only — smart-pool (vault) swaps cannot be fulfilled as
// UniswapX Dutch orders, so UNISWAPX_LATEST is excluded from the default route options. The type
// below still includes it because persisted settings stores may carry it from older versions;
// filterProtocols strips it before it can reach a quote request.
export const DEFAULT_PROTOCOL_OPTIONS = [
  // `as const` allows us to derive a type narrower than TradingApi.ProtocolItems, and the `...` spread removes readonly, allowing DEFAULT_PROTOCOL_OPTIONS to be passed around as an argument without `readonly`
  ...([TradingApi.ProtocolItems.V4, TradingApi.ProtocolItems.V3, TradingApi.ProtocolItems.V2] as const),
]
export type FrontendSupportedProtocol =
  | TradingApi.ProtocolItems.UNISWAPX_LATEST
  | TradingApi.ProtocolItems.V4
  | TradingApi.ProtocolItems.V3
  | TradingApi.ProtocolItems.V2

// RigoBlock: always strip UNISWAPX_LATEST, regardless of the `uniswapXEnabled` argument. The
// upstream `uniswapx` statsig gate is upstream-controlled (the fork proxies Statsig through the
// gateway), so honoring the flag here would let an upstream rollout re-enable X routing and send
// every smart-pool swap down the UniswapX order-signing flow, which the vault cannot complete.
// This function is the single choke point for both quote request paths (the
// useQuoteRoutingParams hook and evmTradeService), so it must keep filtering even when the flag
// is on. Re-apply on upstream syncs — never "restore" the flag check.
export function filterProtocols(
  userSelectedProtocols: FrontendSupportedProtocol[],
  _uniswapXEnabled: boolean,
): TradingApi.ProtocolItems[] {
  return userSelectedProtocols.filter((protocol) => protocol !== TradingApi.ProtocolItems.UNISWAPX_LATEST)
}

export function useProtocols(userSelectedProtocols: FrontendSupportedProtocol[]): TradingApi.ProtocolItems[] {
  const uniswapXEnabled = useFeatureFlag(FeatureFlags.UniswapX)

  return useMemo(() => {
    return filterProtocols(userSelectedProtocols, uniswapXEnabled)
  }, [userSelectedProtocols, uniswapXEnabled])
}

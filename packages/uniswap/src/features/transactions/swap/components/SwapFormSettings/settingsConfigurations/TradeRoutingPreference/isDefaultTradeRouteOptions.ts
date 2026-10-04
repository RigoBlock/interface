import { TradingApi } from '@universe/api'
import {
  DEFAULT_PROTOCOL_OPTIONS,
  type FrontendSupportedProtocol,
} from 'uniswap/src/features/transactions/swap/utils/protocols'

export function isDefaultTradeRouteOptions({
  selectedProtocols,
  isV4HookPoolsEnabled,
}: {
  selectedProtocols: FrontendSupportedProtocol[]
  isV4HookPoolsEnabled: boolean
}): boolean {
  // RigoBlock: persisted settings may still list UNISWAPX_LATEST from before it was removed from
  // the defaults; the fork filters it out of quote requests, so "Default" is judged on the
  // effective (classic) protocol set.
  const effectiveSelectedProtocols = selectedProtocols.filter(
    (protocol) => protocol !== TradingApi.ProtocolItems.UNISWAPX_LATEST,
  )
  return (
    new Set(effectiveSelectedProtocols).size ===
      new Set([...effectiveSelectedProtocols, ...DEFAULT_PROTOCOL_OPTIONS]).size && isV4HookPoolsEnabled
  )
}

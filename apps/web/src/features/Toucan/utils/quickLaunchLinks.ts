import { UniverseChainId } from '@universe/chains'
import type { EnrichedAuction } from '~/features/Toucan/hooks/useTopAuctions/useTopAuctions'
import { isQuickLaunchAuction } from '~/features/Toucan/utils/quickLaunchClassification'

/**
 * pools.xyz — the standalone quick-launch product (labs/rh-cca). Quick launches are created and
 * bid on there, so discovery surfaces link quick-launch auctions out to its bid page instead of the
 * web app's auction page. The bid page route is `/t/:tokenAddress` (labs/rh-cca app/routes.ts).
 */
const POOLS_BASE_URL = 'https://pools.xyz'

/**
 * External pools.xyz bid-page URL for a quick-launch auction, or undefined when one can't be
 * constructed — pools.xyz serves Robinhood Chain launches only (labs/rh-cca app/lib/chains.ts
 * LAUNCH_CHAIN_ID), so other chains (and missing token addresses) fall back to the caller's
 * web-app auction link.
 */
export function getPoolsTradeBidPageUrl({
  chainId,
  tokenAddress,
}: {
  chainId: number | undefined
  tokenAddress: string | undefined
}): string | undefined {
  if (chainId !== UniverseChainId.Robinhood || !tokenAddress) {
    return undefined
  }
  return `${POOLS_BASE_URL}/t/${tokenAddress}`
}

/**
 * The pools.xyz link-out for an auction list item: set only when the quick-launch treatment is
 * enabled (feature flag), the auction is classified as a quick launch, and a pools.xyz URL can
 * be constructed. Undefined means the caller keeps its web-app auction link.
 */
export function getQuickLaunchExternalBidUrl({
  enrichedAuction,
  isQuickLaunchFlagEnabled,
}: {
  enrichedAuction: EnrichedAuction
  isQuickLaunchFlagEnabled: boolean
}): string | undefined {
  if (!isQuickLaunchFlagEnabled || !isQuickLaunchAuction(enrichedAuction)) {
    return undefined
  }
  return getPoolsTradeBidPageUrl({
    chainId: enrichedAuction.auction?.chainId,
    tokenAddress: enrichedAuction.auction?.tokenAddress,
  })
}

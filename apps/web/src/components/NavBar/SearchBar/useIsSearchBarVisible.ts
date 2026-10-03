import { useSyncExternalStore } from 'react'
import { addMediaQueryListener, removeMediaQueryListener } from '~/utils/matchMedia'

// Collapse the inline search bar into its icon below this width.
// RigoBlock fork: upstream raised this to 1560px to make room for the Launches
// tab's Beta pill, but the fork has no Launches tab. At 1280–1560px the false
// branch also drops the operated-pool pill into the `Right` nav cluster, which
// squeezes the connected-wallet button and hides the wallet side-panel toggle —
// so the fork keeps the search bar (and the pool pill centered) from the shared
// `xxl` breakpoint (1280px) up.
const SEARCH_BAR_VISIBLE_QUERY = '(min-width: 1280px)'

function subscribe(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(SEARCH_BAR_VISIBLE_QUERY)
  addMediaQueryListener(mediaQuery, onChange)
  return () => removeMediaQueryListener(mediaQuery, onChange)
}

export function useIsSearchBarVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SEARCH_BAR_VISIBLE_QUERY).matches,
    () => true,
  )
}

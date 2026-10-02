import { PersistState } from 'redux-persist'
import { addEnableCustomGasFeeEntry } from 'uniswap/src/state/uniswapMigrations'

type PersistAppState = {
  _persist: PersistState
}

/**
 * Migration to v62. Combines:
 * - upstream: adds the enableCustomGasFee entry to persisted state.
 * - rigoblock: the portfolioStaking slice is no longer persisted, so any cached
 *   lastTotalStakeByAddress state is re-initialized from the reducer on
 *   rehydration (no state transform needed, only the version bump).
 */
export const migration62 = (state: PersistAppState | undefined) => {
  if (!state) {
    return undefined
  }

  const newState = addEnableCustomGasFeeEntry(state)

  return {
    ...newState,
    _persist: { ...state._persist, version: 62 },
  }
}

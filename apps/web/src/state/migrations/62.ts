import { PersistState } from 'redux-persist'

export type PersistAppStateV61 = {
  _persist: PersistState
}

/**
 * No-op migration to v62. The portfolioStaking slice is no longer persisted,
 * so any cached lastTotalStakeByAddress state will be re-initialized from the
 * reducer on rehydration. We only bump the persist version here to avoid a
 * version mismatch for users who loaded the previous experimental build.
 */
export const migration62 = (state: PersistAppStateV61 | undefined) => {
  if (!state) {
    return undefined
  }

  return {
    ...state,
    _persist: { ...state._persist, version: 62 },
  }
}

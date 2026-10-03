import { FeatureFlags, getFeatureFlag, useFeatureFlag } from '@universe/gating'
import { useMemo } from 'react'
import { isAppRigoblockCom, isAppRigoblockStagingCom } from '~/utils/env'

function isRigoblockHostname(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    isAppRigoblockCom(window.location) ||
    isAppRigoblockStagingCom(window.location) ||
    window.location.hostname === 'localhost'
  )
}

export function getIsSessionServiceEnabledOnWeb(): boolean {
  // RigoBlock fork: enabled on rigoblock hosts. Uniswap's entry gateway now
  // requires a valid session for /rpc/* calls (401 otherwise), and the
  // gateway's wildcard CORS makes cookie-based sessions impossible — the fork
  // authenticates with X-Session-ID / X-Device-ID headers, which requires the
  // session to be created (and its id persisted) by the SessionService.
  // If session creation fails, ready() resolves anyway (error is terminal),
  // so gated data clients keep working unauthenticated — same as before.
  return !getFeatureFlag(FeatureFlags.DisableSessionsForPlan)
}

export function useIsSessionServiceEnabledOnWeb(): boolean {
  const disableSessionsForPlan = useFeatureFlag(FeatureFlags.DisableSessionsForPlan)

  return useMemo(() => {
    return !disableSessionsForPlan
  }, [disableSessionsForPlan])
}

export { isRigoblockHostname }

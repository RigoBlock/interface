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
  // RigoBlock deployment does not rely on Uniswap SessionService challenge/cookies.
  if (isRigoblockHostname()) {
    return false
  }

  return !getFeatureFlag(FeatureFlags.DisableSessionsForPlan)
}

export function useIsSessionServiceEnabledOnWeb(): boolean {
  const disableSessionsForPlan = useFeatureFlag(FeatureFlags.DisableSessionsForPlan)

  return useMemo(() => {
    if (isRigoblockHostname()) {
      return false
    }

    return !disableSessionsForPlan
  }, [disableSessionsForPlan])
}

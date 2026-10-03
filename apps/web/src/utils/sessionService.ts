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

export { isRigoblockHostname }

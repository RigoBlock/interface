/* oxlint-disable typescript/no-unnecessary-condition */
import { getConfig } from '~/config'
import { setupAmplitude } from '~/tracing/amplitude'
import { isRemoteReportingEnabled } from '~/utils/env'

// we do not collect analytics atm
const shouldAllowAnalytics = false

if (isRemoteReportingEnabled() && shouldAllowAnalytics) {
  // Dump some metadata into the window to allow client verification.
  window.GIT_COMMIT_HASH = getConfig().gitCommitHash
}

if (shouldAllowAnalytics) {
  setupAmplitude()
}

/**
 * Simple module-level state for bridge sync mode.
 * This is used for RigoBlock smart pool cross-chain swaps.
 *
 * OpType:
 * - Transfer (false/default): Standard bridging - does not affect pool NAV
 * - Sync (true): Rebalances NAV performance across chains
 *
 * State resets on page refresh and does not persist.
 */
let bridgeSyncMode = false

/**
 * Get the current bridge sync mode setting
 * @returns true if Sync mode is enabled, false for Transfer mode (default)
 */
export function getBridgeSyncMode(): boolean {
  return bridgeSyncMode
}

/**
 * Set the bridge sync mode
 * @param enabled - true for Sync mode, false for Transfer mode
 */
export function setBridgeSyncMode(enabled: boolean): void {
  bridgeSyncMode = enabled
}

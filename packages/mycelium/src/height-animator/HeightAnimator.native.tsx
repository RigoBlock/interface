import type { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import type { HeightAnimatorProps } from './HeightAnimatorProps'

/**
 * Native `HeightAnimator`: functional stub per the ratified INFRA-3289
 * animations strategy — expand/collapse is instant (no height animation), but
 * `open` and `unmountChildrenWhenCollapsed` are respected so native-reachable
 * shared call sites keep working.
 *
 * Full audit of the 25 call sites (INFRA-3340 review round 2): three animate
 * on native today and become instant under this stub —
 * - `uniswap/src/components/tokenDetails/NetworkBalanceBreakdown.tsx` — mobile
 *   TDP balance breakdown, mounted by `apps/mobile` `MultichainTokenBalances`.
 * - `wallet/src/features/smartWallet/ActiveNetworkExpando/ActiveNetworkExpando.tsx`
 *   — rendered by `SmartWalletStatusModal`, reachable from the mobile
 *   smart-wallet settings screen.
 * - `wallet/src/features/earn/UnfundedEarnCard.tsx` — rendered by
 *   `HomeScreenEarningSection`, mounted on the mobile home screen portfolio
 *   header.
 * The other native-reachable sites either guard with
 * `animationDisabled={isMobileApp || isMobileWeb}` (SwapDetails,
 * TradeRoutingPreferenceScreen) or only render on web/extension. If motion
 * parity is ever needed, the strategy names the shape: Reanimated
 * `useAnimatedStyle` height + `onLayout`.
 */
export function HeightAnimator({
  open = true,
  useInitialHeight = false,
  unmountChildrenWhenCollapsed = false,
  id,
  children,
}: HeightAnimatorProps): JSX.Element {
  const lazyUnmount = Boolean(unmountChildrenWhenCollapsed && !useInitialHeight)
  // No animation to wait for, so the legacy 550ms collapse delay is dropped: unmount immediately.
  const renderChildren = !lazyUnmount || open

  return (
    <View id={id} style={[styles.container, open ? styles.open : styles.closed]}>
      {renderChildren ? children : null}
    </View>
  )
}

const styles = StyleSheet.create({
  closed: { height: 0 },
  container: { overflow: 'hidden', width: '100%' },
  open: { height: 'auto' },
})

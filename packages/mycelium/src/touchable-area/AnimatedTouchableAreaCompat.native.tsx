import type { ComponentType } from 'react'
import Animated from 'react-native-reanimated'
import type { AnimatedTouchableAreaCompatProps } from './animated-props'
import { TouchableAreaCompat } from './TouchableAreaCompat'

/**
 * Native leg of the `AnimatedTouchableArea` compat: a REAL Reanimated wrapper
 * over the compat TouchableArea (never a stub), replacing the legacy
 * `withAnimated(TouchableArea)` (`components/factories/animated.native.tsx`
 * via `TouchableArea.tsx:425-428`). The compat TouchableArea native leg is a
 * forwardRef to a real RN `View` host, so `createAnimatedComponent` wraps it
 * directly — no class shim needed (the same shape as the AnimatedFlex compat
 * and mycelium's own `createIcon.native.tsx` animated twin).
 */
// Explicit annotation via cast: the inferred AnimatedComponentType names
// mycelium-internal prop types the touchable-area subpath does not export
// (TS2883 under declaration emit).
// FORK NOTE (Oct 2026 sync): upstream types this as
// `FirstOverloadReturn<typeof Animated.createAnimatedComponent<typeof TouchableAreaCompat>>`
// (positional first-overload extraction for reanimated 4.5's flipped overload
// order — see ../compat/first-overload-return). Under tsgo (TS 7, the fork's
// `bun g:typecheck` gate) that conditional resolves the LAST overload, naming
// the deprecated FlatList signature, and the annotated constant fails
// TS2322. The `as unknown as ComponentType<...>` cast is the same idiom as
// mycelium's own createIcon.native.tsx animated twin; the exported-props
// annotation keeps declaration emit naming only public types.
export const AnimatedTouchableAreaCompat = Animated.createAnimatedComponent(
  TouchableAreaCompat,
) as unknown as ComponentType<AnimatedTouchableAreaCompatProps>

// Reanimated v4 returns a function-style component that doesn't expose
// `displayName` on the type. Cast through unknown to assign for devtools
// labeling.
;(AnimatedTouchableAreaCompat as unknown as { displayName?: string }).displayName = 'AnimatedTouchableAreaCompat'

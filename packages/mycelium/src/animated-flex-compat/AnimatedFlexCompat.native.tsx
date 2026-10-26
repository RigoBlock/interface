import type { ComponentType } from 'react'
import Animated from 'react-native-reanimated'
import type { AnimatedFlexCompatProps } from './props'
import { FlexCompat } from '../flex-compat/FlexCompat'

/**
 * Native leg: a real Reanimated wrapper over the compat Flex, ported from ui's AnimatedFlex.native.
 * The base View forwards ref/onLayout and allow-lists collapsable/nativeID — the props Reanimated injects.
 */
// Explicit annotation via cast: the inferred AnimatedComponentType names
// mycelium-internal prop types the animated-flex-compat subpath does not
// export (TS2883 under declaration emit).
// FORK NOTE (Oct 2026 sync): upstream types this as
// `FirstOverloadReturn<typeof Animated.createAnimatedComponent<typeof FlexCompat>>`
// (positional first-overload extraction for reanimated 4.5's flipped overload
// order — see ../compat/first-overload-return). Under tsgo (TS 7, the fork's
// `bun g:typecheck` gate) that conditional resolves the LAST overload, naming
// the deprecated FlatList signature, and the annotated constant fails
// TS2322. The `as unknown as ComponentType<...>` cast is the same idiom as
// mycelium's own createIcon.native.tsx animated twin; the exported-props
// annotation keeps declaration emit naming only public types.
export const AnimatedFlexCompat = Animated.createAnimatedComponent(
  FlexCompat,
) as unknown as ComponentType<AnimatedFlexCompatProps>

// Reanimated v4 returns a function-style component that doesn't expose
// `displayName` on the type. Cast through unknown to assign for devtools
// labeling — the legacy native leg's exact idiom.
;(AnimatedFlexCompat as unknown as { displayName?: string }).displayName = 'AnimatedFlexCompat'

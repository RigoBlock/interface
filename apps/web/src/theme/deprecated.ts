/**
 * Type-level reconstruction of the legacy styled-components theme that the
 * deprecated RigoBlock pages still reference through `~/lib/deprecated-styled`.
 *
 * Upstream deleted the old `DefaultTheme`-based theme (`~/theme`, `ThemedText`,
 * `themeGet`); the runtime values are no longer provided by a ThemeProvider,
 * but the remaining styled-components-era code still types its interpolations
 * against this shape. The augmentation below keeps that code compiling.
 */
import type { css } from '~/lib/deprecated-styled'

export type DeprecatedGap = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** Matches the legacy `MEDIA_WIDTHS` breakpoints (px). */
export interface DeprecatedBreakpoint {
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

interface DeprecatedMediaWidthTemplates {
  deprecated_upToExtraSmall: typeof css
  deprecated_upToSmall: typeof css
  deprecated_upToMedium: typeof css
  deprecated_upToLarge: typeof css
}

export interface DeprecatedTheme {
  // colors
  accent1: string
  accent2: string
  accent3: string
  neutral1: string
  neutral2: string
  neutral3: string
  neutralContrast: string
  surface1: string
  surface2: string
  surface3: string
  surface4: string
  surface1Hovered: string
  surface3Hovered: string
  white: string
  black: string
  critical: string
  success: string
  deprecated_yellow3: string
  deprecated_shallowShadow: string
  deprecated_hoverDefault: string
  // misc tokens
  grids: Record<DeprecatedGap, string>
  breakpoint: DeprecatedBreakpoint
  opacity: { hover: number }
  transition: {
    duration: { slow: string; medium: string; fast: string }
    timing: { ease: string; in: string; out: string; inOut: string }
  }
  deprecated_mediaWidth: DeprecatedMediaWidthTemplates
}

declare module 'styled-components' {
  // oxlint-disable-next-line no-empty-interface -- interface augmentation requires an empty body extension point
  export interface DefaultTheme extends DeprecatedTheme {}
}

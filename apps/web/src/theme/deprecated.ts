/**
 * Type-level reconstruction of the legacy styled-components theme that the
 * deprecated RigoBlock pages still reference through `~/lib/deprecated-styled`.
 *
 * Upstream deleted the old `DefaultTheme`-based theme (`~/theme`, `ThemedText`,
 * `themeGet`); this module restores the runtime values as well, mapped onto the
 * current spore color tokens (`ui/src/theme/color/colors`), and is mounted by
 * `DeprecatedThemeProvider` in `~/theme/index.tsx`. Without that provider the
 * legacy pages crash on `theme.grids[...]`-style interpolations.
 */
import { breakpoints } from 'ui/src/theme'
import { colorsDark, colorsLight } from 'ui/src/theme/color/colors'
import { css } from '~/lib/deprecated-styled'

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

// #region Runtime values

/** Legacy gap scale, preserved verbatim from the deleted `~/theme`. */
export const deprecatedGrids: Record<DeprecatedGap, string> = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '24px',
  xl: '32px',
}

const deprecatedTransitions: DeprecatedTheme['transition'] = {
  duration: { slow: '500ms', medium: '250ms', fast: '125ms' },
  timing: { ease: 'ease', in: 'ease-in', out: 'ease-out', inOut: 'ease-in-out' },
}

const deprecatedOpacity: DeprecatedTheme['opacity'] = { hover: 0.6 }

const deprecatedBreakpoint: DeprecatedBreakpoint = {
  sm: breakpoints.sm,
  md: breakpoints.md,
  lg: breakpoints.lg,
  xl: breakpoints.xl,
  xxl: breakpoints.xxl,
}

const MEDIA_WIDTH_PX = {
  deprecated_upToExtraSmall: 500,
  deprecated_upToSmall: 720,
  deprecated_upToMedium: 960,
  deprecated_upToLarge: 1280,
} as const

const mediaWidthTemplate =
  (width: number): typeof css =>
  (...args: Parameters<typeof css>) =>
    css`
      @media (max-width: ${width}px) {
        ${css(...args)}
      }
    `

const deprecatedMediaWidth: DeprecatedMediaWidthTemplates = {
  deprecated_upToExtraSmall: mediaWidthTemplate(MEDIA_WIDTH_PX.deprecated_upToExtraSmall),
  deprecated_upToSmall: mediaWidthTemplate(MEDIA_WIDTH_PX.deprecated_upToSmall),
  deprecated_upToMedium: mediaWidthTemplate(MEDIA_WIDTH_PX.deprecated_upToMedium),
  deprecated_upToLarge: mediaWidthTemplate(MEDIA_WIDTH_PX.deprecated_upToLarge),
}

/**
 * Builds the runtime legacy theme for the given color scheme. Color values map
 * onto the current spore tokens so deprecated pages track the app theme
 * (including the RigoBlock accent); structural tokens (grids, breakpoints,
 * transitions) are preserved verbatim from the deleted theme.
 */
export function getDeprecatedTheme(darkMode: boolean): DeprecatedTheme {
  const colors = darkMode ? colorsDark : colorsLight
  return {
    accent1: colors.accent1,
    accent2: colors.accent2,
    accent3: colors.accent3,
    neutral1: colors.neutral1,
    neutral2: colors.neutral2,
    neutral3: colors.neutral3,
    neutralContrast: colors.neutral1Contrast,
    surface1: colors.surface1,
    surface2: colors.surface2,
    surface3: colors.surface3,
    surface4: colors.surface4,
    surface1Hovered: colors.surface1Hovered,
    surface3Hovered: colors.surface3Hovered,
    white: colors.white,
    black: colors.black,
    critical: colors.statusCritical,
    success: colors.statusSuccess,
    // Legacy tokens with no spore equivalent — values preserved from the
    // deleted theme (old gray300/yellow600 palette).
    deprecated_yellow3: '#5D4204',
    deprecated_shallowShadow: '0px 0px 10px 0px rgba(34, 34, 34, 0.04);',
    deprecated_hoverDefault: 'rgba(152, 161, 192, 0.08)', // opacify(8, old gray300 #98A1C0)
    grids: deprecatedGrids,
    breakpoint: deprecatedBreakpoint,
    opacity: deprecatedOpacity,
    transition: deprecatedTransitions,
    deprecated_mediaWidth: deprecatedMediaWidth,
  }
}

// #endregion

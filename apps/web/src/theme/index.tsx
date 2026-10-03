/**
 * Rigoblock-era styled-components theme module.
 *
 * Upstream migrated to Tamagui/mycelium and deleted the old
 * `DefaultTheme`-based theme. RigoBlock pages still rely on the
 * styled-components theme (via `~/lib/deprecated-styled`), so this module
 * keeps the value-level surface alive: `MEDIA_WIDTHS` and the `Gap` spacing
 * keys. The `styled-components` `DefaultTheme` augmentation itself lives in
 * `~/theme/deprecated` — keep only one augmentation file or the interface
 * merge fails.
 *
 * @deprecated use mycelium/spore theme tokens instead
 */
import { PropsWithChildren, useMemo } from 'react'
import { useSelectedColorScheme } from 'uniswap/src/features/appearance/hooks'
import { ThemeProvider as StyledComponentsThemeProvider } from '~/lib/deprecated-styled'
import { css } from '~/lib/deprecated-styled'
import { getDeprecatedTheme } from '~/theme/deprecated'
import type { DeprecatedGap } from '~/theme/deprecated'

export const MAX_CONTENT_WIDTH_PX = 1200

/** @deprecated use mycelium spacing tokens instead */
export type Gap = DeprecatedGap

/** @deprecated use mycelium media props (`$md` etc.) instead */
export const MEDIA_WIDTHS = {
  deprecated_upToExtraSmall: 500,
  deprecated_upToSmall: 720,
  deprecated_upToMedium: 960,
  deprecated_upToLarge: 1280,
} as const

/**
 * Provides the legacy styled-components theme to deprecated RigoBlock pages.
 * Upstream deleted the old ThemeProvider entirely; the fork still has
 * styled-components-era pages whose interpolations read `theme.grids`,
 * `theme.accent1`, etc., so the runtime theme (mapped to spore tokens) is
 * mounted here. Render inside the color-scheme-aware provider tree.
 */
export function DeprecatedThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const darkMode = useSelectedColorScheme() === 'dark'
  const theme = useMemo(() => getDeprecatedTheme(darkMode), [darkMode])
  return <StyledComponentsThemeProvider theme={theme}>{children}</StyledComponentsThemeProvider>
}

/** Tagged-template helper that wraps CSS in a `max-width` media query. */
export type DeprecatedMediaWidthTemplate = (
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null | undefined)[]
) => ReturnType<typeof css>

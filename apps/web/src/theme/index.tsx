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
import { css } from '~/lib/deprecated-styled'
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

/** Tagged-template helper that wraps CSS in a `max-width` media query. */
export type DeprecatedMediaWidthTemplate = (
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null | undefined)[]
) => ReturnType<typeof css>

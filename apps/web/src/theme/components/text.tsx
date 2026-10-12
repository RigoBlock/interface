import { Text, type TextProps } from '@universe/mycelium'

/**
 * Legacy `ThemedText` presets, rebuilt directly on the shared mycelium `Text`
 * — the same component the modern pages (Earn, Portfolio, …) use — instead of
 * the `rebass` primitive upstream deleted. Old styled-components theme color
 * keys are translated to spore tokens, so RigoBlock gold (`$accent1`) comes
 * from the theme like everywhere else. When touching a call site, prefer
 * migrating it to a plain mycelium `Text` with a `variant` instead of these
 * presets.
 */
export type ThemedTextProps = TextProps

const colorMap = {
  accent1: '$accent1',
  accent2: '$accent2',
  accent3: '$accent3',
  neutral1: '$neutral1',
  neutral2: '$neutral2',
  neutral3: '$neutral3',
  surface1: '$surface1',
  surface2: '$surface2',
  surface3: '$surface3',
  surface4: '$surface4',
  white: '$white',
  black: '$black',
  success: '$statusSuccess',
  critical: '$statusCritical',
} as const

function resolveColor(color: TextProps['color']): TextProps['color'] {
  return typeof color === 'string' && color in colorMap ? colorMap[color as keyof typeof colorMap] : color
}

/**
 * The spore type scale's line heights, indexed by font size. The mycelium `Text`
 * defaults to the `body2` variant (16px/22px) and keeps that 22px line height even
 * when a preset or call site overrides the font size — 36px glyphs in a 22px line
 * box overlap adjacent rows (the rebass-era presets never set a line height, so it
 * scaled with the font). Restore the legacy pairing by line height.
 */
const LINE_HEIGHT_BY_FONT_SIZE: Record<number, number> = {
  52: 50,
  36: 40,
  24: 28,
  20: 24,
  18: 24,
  16: 22,
  14: 18,
  12: 16,
  10: 12,
}

function preset(defaults: TextProps) {
  return function ThemedTextPreset({ color, fontSize, lineHeight, whiteSpace, wordWrap, ...props }: ThemedTextProps) {
    const resolvedFontSize = fontSize ?? defaults.fontSize
    // tag="div" preserves the block layout the rebass-era presets had. The mycelium
    // Text compiles Tamagui's whitespace-pre-wrap/word-wrap:break-word defaults;
    // legacy text used normal wrapping, which kept single values on one line.
    // Props are spread conditionally: an explicit undefined would clobber the
    // defaults spread above it.
    return (
      <Text
        tag="div"
        {...defaults}
        color={resolveColor(color) ?? defaults.color}
        {...(fontSize !== undefined ? { fontSize } : null)}
        {...(lineHeight !== undefined
          ? { lineHeight }
          : { lineHeight: typeof resolvedFontSize === 'number' ? (LINE_HEIGHT_BY_FONT_SIZE[resolvedFontSize] ?? 'unset') : 'unset' })}
        {...(whiteSpace !== undefined ? { whiteSpace } : { whiteSpace: 'normal' })}
        {...(wordWrap !== undefined ? { wordWrap } : { wordWrap: 'normal' })}
        {...props}
      />
    )
  }
}

export const ThemedText = {
  DeprecatedMain: preset({ fontWeight: 500, color: '$neutral1' }),
  DeprecatedLink: preset({ fontWeight: 500, color: '$accent1', cursor: 'pointer', hoverStyle: { opacity: 0.8 } }),
  DeprecatedBody: preset({ fontWeight: 400, color: '$neutral2', fontSize: 16 }),
  DeprecatedLargeHeader: preset({ fontWeight: 400, fontSize: 36 }),
  DeprecatedMediumHeader: preset({ fontWeight: 400, fontSize: 20, color: '$neutral1' }),
  DeprecatedSubHeader: preset({ fontWeight: 400, fontSize: 14, color: '$neutral2' }),
  DeprecatedWhite: preset({ fontWeight: 500, color: '$white' }),
  DeprecatedBlack: preset({ fontWeight: 500, color: '$black' }),
  BodySmall: preset({ fontWeight: 485, fontSize: 12, color: '$neutral2' }),
  BodySecondary: preset({ fontWeight: 485, fontSize: 12, color: '$neutral2' }),
  HeadlineLarge: preset({ fontWeight: 500, fontSize: 36, color: '$neutral1' }),
  H1Small: preset({ fontWeight: 500, fontSize: 20, color: '$neutral1' }),
}

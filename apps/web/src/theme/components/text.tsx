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

function preset(defaults: TextProps) {
  return function ThemedTextPreset({ color, ...props }: ThemedTextProps) {
    // tag="div" preserves the block layout the rebass-era presets had.
    return <Text tag="div" {...defaults} color={resolveColor(color) ?? defaults.color} {...props} />
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

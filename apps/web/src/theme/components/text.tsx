import { Text, type TextProps } from 'rebass'
import { deprecatedStyled } from '~/lib/deprecated-styled'

type DeprecatedTextColor =
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'neutral1'
  | 'neutral2'
  | 'neutral3'
  | 'surface1'
  | 'surface2'
  | 'surface3'
  | 'surface4'
  | 'white'
  | 'black'
  | 'success'
  | 'critical'

const TextWrapper = deprecatedStyled(Text)<{ color?: DeprecatedTextColor }>`
  color: ${({ color, theme }) => (color ? theme[color] : 'inherit')};
`

type ThemedTextProps = TextProps & { color?: DeprecatedTextColor }

/**
 * Preset text styles historically provided by `~/theme/components/text`.
 * Upstream deleted the module; the deprecated variants are kept here for
 * the rigoblock pages that still render via styled-components.
 */
export const ThemedText = {
  DeprecatedMain: (props: ThemedTextProps) => <TextWrapper fontWeight={500} color="neutral1" {...props} />,
  DeprecatedLink: (props: ThemedTextProps) => (
    <TextWrapper fontWeight={500} color="accent1" sx={{ cursor: 'pointer', ':hover': { opacity: '0.8' } }} {...props} />
  ),
  DeprecatedBody: (props: ThemedTextProps) => (
    <TextWrapper fontWeight={400} color="neutral2" fontSize={16} {...props} />
  ),
  DeprecatedLargeHeader: (props: ThemedTextProps) => <Text fontWeight={400} fontSize={36} {...props} />,
  DeprecatedMediumHeader: (props: ThemedTextProps) => (
    <TextWrapper fontWeight={400} fontSize={20} color="neutral1" {...props} />
  ),
  DeprecatedSubHeader: (props: ThemedTextProps) => (
    <TextWrapper fontWeight={400} fontSize={14} color="neutral2" {...props} />
  ),
  DeprecatedWhite: (props: ThemedTextProps) => <TextWrapper fontWeight={500} color="white" {...props} />,
  DeprecatedBlack: (props: ThemedTextProps) => <TextWrapper fontWeight={500} color="black" {...props} />,
  BodySmall: (props: ThemedTextProps) => <TextWrapper fontWeight={485} fontSize={12} color="neutral2" {...props} />,
  BodySecondary: (props: ThemedTextProps) => <TextWrapper fontWeight={485} fontSize={12} color="neutral2" {...props} />,
  HeadlineLarge: (props: ThemedTextProps) => <TextWrapper fontWeight={500} fontSize={36} color="neutral1" {...props} />,
  H1Small: (props: ThemedTextProps) => <TextWrapper fontWeight={500} fontSize={20} color="neutral1" {...props} />,
}

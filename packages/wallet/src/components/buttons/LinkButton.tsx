import { Flex, FlexCompatProps, iconSizes, Text, TouchableArea, TouchableAreaCompatProps } from '@universe/mycelium'
import { ExternalLink } from '@universe/mycelium/icons/ExternalLink'
import { useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { useMemo } from 'react'
import { TextVariantTokens } from 'ui/src/theme'
import { openUri } from 'uniswap/src/utils/linking'

interface LinkButtonProps extends Omit<TouchableAreaCompatProps, 'onPress' | 'children' | 'variant'> {
  label: string
  url: string
  openExternalBrowser?: boolean
  isSafeUri?: boolean
  color?: string
  iconColor?: string
  showIcon?: boolean
  size?: number
  textVariant?: TextVariantTokens
}

export function LinkButton({
  url,
  label,
  textVariant,
  color,
  iconColor,
  showIcon = true,
  openExternalBrowser = false,
  isSafeUri = false,
  size = iconSizes.icon20,
  justifyContent = 'center',
  ...rest
}: LinkButtonProps & Pick<FlexCompatProps, 'justifyContent'>): JSX.Element {
  const colors = useSporeColors()
  const colorStyles = useMemo(() => {
    return color
      ? { style: { color } }
      : // if a hex color is not defined, don't give the Text component a style prop, because that will override its default behavior of using neutral1 when no color prop is defined
        {}
  }, [color])

  return (
    <TouchableArea onPress={() => openUri({ uri: url, openExternalBrowser, isSafeUri })} {...rest}>
      <Flex row alignItems="center" gap="$spacing4" justifyContent={justifyContent}>
        <Text {...colorStyles} flexShrink={1} variant={textVariant ?? 'body2'}>
          {label}
        </Text>
        {showIcon && <ExternalLink color={iconColor ?? color ?? colors.accent1.get()} size={size} strokeWidth={1.5} />}
      </Flex>
    </TouchableArea>
  )
}

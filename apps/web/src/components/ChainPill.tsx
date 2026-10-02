import { Flex } from '@universe/mycelium'
import type { FlexCompatProps } from '@universe/mycelium'
import { forwardRef, type PropsWithChildren } from 'react'

interface ChainPillProps extends PropsWithChildren<FlexCompatProps> {
  active?: boolean
}

/**
 * Selectable chain chip used for chain selection across the app
 * (smart pool chain pills, bridge source-chain selection, ...).
 * Selected state uses accent border/fill matching the app theme.
 */
export const ChainPill = forwardRef<HTMLDivElement, ChainPillProps>(function ChainPill(
  { active, children, ...rest },
  ref,
) {
  return (
    <Flex
      ref={ref}
      row
      alignItems="center"
      gap="$spacing4"
      px="$spacing6"
      py="$spacing2"
      borderRadius="$rounded8"
      borderWidth={1}
      borderColor={active ? '$accent1' : '$surface3'}
      backgroundColor={active ? '$accent2' : undefined}
      cursor="pointer"
      hoverStyle={{ backgroundColor: '$surface2' }}
      {...rest}
    >
      {children}
    </Flex>
  )
})

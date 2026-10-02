import { cn, Flex } from '@universe/mycelium'
import type { FlexCompatProps as FlexProps } from '@universe/mycelium'
import { PropsWithChildren } from 'react'
import { useSporeColors } from 'ui/src'
import styled, { DefaultTheme } from '~/lib/deprecated-styled'

export const Card = ({ children, className, ...rest }: PropsWithChildren<FlexProps>) => {
  return (
    <Flex width="100%" className={cn('p-[1rem]', className)} borderRadius="$rounded12" {...rest}>
      {children}
    </Flex>
  )
}

export const LightCard = ({ children, ...rest }: PropsWithChildren<FlexProps>) => {
  return (
    <Card backgroundColor="$surface2" borderWidth={1} borderColor="$surface3" {...rest}>
      {children}
    </Card>
  )
}

export const DarkGrayCard = ({ children, ...rest }: PropsWithChildren<FlexProps>) => {
  return (
    <Card backgroundColor="$surface3" {...rest}>
      {children}
    </Card>
  )
}

// Explicit type: styled()'s inferred type references non-portable mycelium internals (TS2883).
export const DarkCard: typeof Card = styled(Card)`
  background-color: ${({ theme }: { theme: DefaultTheme }) => theme.surface1};
  border: 1px solid ${({ theme }: { theme: DefaultTheme }) => theme.surface3};
`

export const OutlineCard = ({ children, ...rest }: PropsWithChildren<FlexProps>) => {
  return (
    <Card backgroundColor="$surface2" borderWidth={1} borderColor="$surface3" {...rest}>
      {children}
    </Card>
  )
}

export const YellowCard = ({ children, ...rest }: PropsWithChildren<FlexProps>) => {
  const colors = useSporeColors()
  return (
    <Card
      backgroundColor="rgba(243, 132, 30, 0.05)"
      {...rest}
      $platform-web={{
        color: colors.statusWarning.val,
        ...rest['$platform-web'],
      }}
    >
      {children}
    </Card>
  )
}

export const BlueCard = ({ children, ...rest }: PropsWithChildren<FlexProps>) => {
  const colors = useSporeColors()
  return (
    <Card
      backgroundColor="$accent2"
      {...rest}
      $platform-web={{
        color: colors.accent1.val,
        ...rest['$platform-web'],
      }}
    >
      {children}
    </Card>
  )
}

import { Flex, styled } from 'ui/src'

/**
 * Selectable chain chip used for chain selection across the app
 * (smart pool chain pills, bridge source-chain selection, ...).
 * Selected state uses accent border/fill matching the app theme.
 */
export const ChainPill = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing4',
  paddingHorizontal: '$spacing6',
  paddingVertical: '$spacing2',
  borderRadius: '$rounded8',
  borderWidth: 1,
  borderColor: '$surface3',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: '$surface2',
  },
  variants: {
    active: {
      true: {
        borderColor: '$accent1',
        backgroundColor: '$accent2',
      },
    },
  } as const,
})

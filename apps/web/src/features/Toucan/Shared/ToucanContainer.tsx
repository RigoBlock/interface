import { Flex } from '@universe/mycelium'
import { ComponentProps, type FC, PropsWithChildren } from 'react'
import { MAX_CONTENT_WIDTH_PX } from '~/theme'

// Explicit type: the inferred arrow-function type isn't nameable under declaration emit (TS2883).
export const ToucanContainer: FC<PropsWithChildren<ComponentProps<typeof Flex>>> = ({ children, ...props }) => {
  return (
    <Flex
      width="100%"
      mx="auto"
      maxWidth={MAX_CONTENT_WIDTH_PX}
      $xxl={{ px: 80 }}
      $xl={{ px: '$spacing48' }}
      $lg={{ px: '$spacing48' }}
      $md={{ px: '$spacing32' }}
      $sm={{ px: '$spacing16' }}
      {...props}
    >
      {children}
    </Flex>
  )
}

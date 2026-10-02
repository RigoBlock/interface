import { Bolt } from '@universe/mycelium/icons/Bolt'
import { Droplet } from '@universe/mycelium/icons/Droplet'
import { Settings } from '@universe/mycelium/icons/Settings'
import type { ComponentProps } from 'react'
import { colors } from 'ui/src/theme'
import { AuctionLaunchMethod } from '~/features/Toucan/Auction/utils/auctionLaunchMethod'
import { usePoolsBrandGreen } from '~/hooks/usePoolsBrandGreen'

/** Method glyphs do not imply a launchpad identity. */
export function AuctionLaunchMethodIcon({
  method,
  size,
}: {
  method: AuctionLaunchMethod
  size: ComponentProps<typeof Settings>['size']
}): JSX.Element {
  const poolsBrandGreen = usePoolsBrandGreen()
  const icons: Record<AuctionLaunchMethod, JSX.Element> = {
    [AuctionLaunchMethod.Custom]: <Settings size={size} color="$neutral1" />,
    [AuctionLaunchMethod.Crowd]: <Droplet size={size} color={poolsBrandGreen} />,
    [AuctionLaunchMethod.Instant]: <Bolt size={size} color={colors.cyanBase} />,
  }
  return icons[method]
}

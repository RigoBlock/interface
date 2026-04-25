import { Flex, useSporeColors } from 'ui/src'
import { BidMarker } from '~/components/Toucan/Auction/BidDistributionChart/markers/BidMarker'
import { MarkerPosition } from '~/components/Toucan/Auction/BidDistributionChart/markers/types'
import { BidTokenInfo } from '~/components/Toucan/Auction/store/types'

/** Height of each "rung" in the ladder background */
const LADDER_RUNG_HEIGHT = 1
/** Gap between rungs */
const LADDER_GAP = 4

interface BidMarkerOverlayProps {
  markerPositions: MarkerPosition[]
  bidTokenInfo: BidTokenInfo
  formatPrice: (value: string, decimals: number) => string
  formatTokenAmount: (value: string, decimals: number) => string
}

/**
 * Overlay component that renders all bid markers on top of the chart.
 * Uses absolute positioning to place markers at calculated screen coordinates.
 * Includes a ladder-like background of stacked horizontal lines.
 */
export function BidMarkerOverlay({
  markerPositions,
  bidTokenInfo,
  formatPrice,
  formatTokenAmount,
}: BidMarkerOverlayProps) {
  const colors = useSporeColors()

  return (
    <Flex position="absolute" inset={0} pointerEvents="none" zIndex={2}>
      {/* Ladder background — repeating horizontal lines */}
      <Flex
        position="absolute"
        inset={0}
        overflow="hidden"
        style={{
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            ${colors.surface3.val} 0px,
            ${colors.surface3.val} ${LADDER_RUNG_HEIGHT}px,
            transparent ${LADDER_RUNG_HEIGHT}px,
            transparent ${LADDER_RUNG_HEIGHT + LADDER_GAP}px
          )`,
        }}
      />
      {markerPositions.map((marker) => (
        <BidMarker
          key={marker.id}
          marker={marker}
          bidTokenInfo={bidTokenInfo}
          formatPrice={formatPrice}
          formatTokenAmount={formatTokenAmount}
        />
      ))}
    </Flex>
  )
}

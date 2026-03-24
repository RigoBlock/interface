import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Popover, Text } from 'ui/src'
import { CheckCircleFilled } from 'ui/src/components/icons/CheckCircleFilled'
import { HookTileContainer } from '~/pages/Liquidity/CreateAuction/components/HookTile'
import { SupplyCurve } from '~/pages/Liquidity/CreateAuction/types'

const NUM_BARS = 50
const SPIKE_TAIL = [8, 12, 16, 16]
const SPIKE_HEIGHTS = [...Array.from({ length: NUM_BARS - SPIKE_TAIL.length }, () => 4), ...SPIKE_TAIL]

function BarChart({ heights, color }: { heights: number[]; color: '$statusSuccess' | '$neutral3' }) {
  return (
    <Flex row gap={2} alignItems="flex-end" height={16}>
      {heights.map((h, i) => (
        <Flex key={i} width={2} height={h} borderRadius={2} backgroundColor={color} flexShrink={0} />
      ))}
    </Flex>
  )
}

const LINEAR_HEIGHTS = Array.from({ length: NUM_BARS }, () => 16)

export function SupplyCurvePopover({
  supplyCurve,
  onSelect,
  trigger,
}: {
  supplyCurve: SupplyCurve
  onSelect: (curve: SupplyCurve) => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const handleSelect = useCallback(
    (curve: SupplyCurve): void => {
      onSelect(curve)
    },
    [onSelect],
  )

  const handleSelectLinear = useCallback(() => handleSelect(SupplyCurve.LINEAR), [handleSelect])
  const handleSelectLinearSpike = useCallback(() => handleSelect(SupplyCurve.LINEAR_SPIKE), [handleSelect])

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={setOpen}>
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <Popover.Content
        backgroundColor="$surface1"
        borderWidth="$spacing1"
        borderColor="$surface3"
        borderRadius="$rounded16"
        p="$spacing12"
        gap="$spacing8"
        width={254}
        enterStyle={{ opacity: 0, y: -4 }}
        exitStyle={{ opacity: 0, y: -4 }}
        animation="fast"
        animateOnly={['opacity', 'transform']}
      >
        <Text variant="body3" color="$neutral2" alignSelf="flex-start">
          {t('toucan.createAuction.step.configureAuction.supplyCurve')}
        </Text>

        <HookTileContainer
          onPress={handleSelectLinear}
          background={supplyCurve === SupplyCurve.LINEAR ? '$surface3' : '$surface2'}
          borderWidth={0}
        >
          <Flex row gap="$spacing8" justifyContent="space-between" alignItems="center">
            <Text variant="buttonLabel3" color="$neutral1">
              {t('toucan.createAuction.step.configureAuction.supplyCurve.linear')}
            </Text>
            {supplyCurve === SupplyCurve.LINEAR && <CheckCircleFilled size="$icon.20" />}
          </Flex>
          <Text variant="body4" color={supplyCurve === SupplyCurve.LINEAR ? '$neutral1' : '$neutral2'}>
            {t('toucan.createAuction.step.configureAuction.supplyCurve.linear.description')}
          </Text>
          <BarChart
            heights={LINEAR_HEIGHTS}
            color={supplyCurve === SupplyCurve.LINEAR ? '$statusSuccess' : '$neutral3'}
          />
        </HookTileContainer>

        <HookTileContainer
          onPress={handleSelectLinearSpike}
          background={supplyCurve === SupplyCurve.LINEAR_SPIKE ? '$surface3' : '$surface2'}
          borderWidth={0}
        >
          <Flex row gap="$spacing8" justifyContent="space-between" alignItems="center">
            <Text variant="buttonLabel3" color="$neutral1">
              {t('toucan.createAuction.step.configureAuction.supplyCurve.linearSpike')}
            </Text>
            {supplyCurve === SupplyCurve.LINEAR_SPIKE && <CheckCircleFilled size="$icon.20" />}
          </Flex>
          <Text variant="body4" color={supplyCurve === SupplyCurve.LINEAR_SPIKE ? '$neutral1' : '$neutral2'}>
            {t('toucan.createAuction.step.configureAuction.supplyCurve.linearSpike.description')}
          </Text>
          <BarChart
            heights={SPIKE_HEIGHTS}
            color={supplyCurve === SupplyCurve.LINEAR_SPIKE ? '$statusSuccess' : '$neutral3'}
          />
        </HookTileContainer>
      </Popover.Content>
    </Popover>
  )
}

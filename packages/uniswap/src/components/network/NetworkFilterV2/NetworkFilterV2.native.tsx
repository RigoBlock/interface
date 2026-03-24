import { useState } from 'react'
import { Flex, Text, TouchableArea } from 'ui/src'
import { iconSizes } from 'ui/src/theme'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { Modal } from 'uniswap/src/components/modals/Modal'
import type { NetworkFilterV2Props } from 'uniswap/src/components/network/NetworkFilterV2/NetworkFilterV2'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'

const NETWORK_ICON_SIZE = iconSizes.icon20

export function NetworkFilterV2({ selectedChain, includeAllNetworks }: NetworkFilterV2Props): JSX.Element {
  const { defaultChainId } = useEnabledChains()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <TouchableArea testID={TestID.TokensNetworkFilterTrigger} onPress={() => setIsOpen(true)}>
        <NetworkLogo chainId={selectedChain ?? (includeAllNetworks ? null : defaultChainId)} size={NETWORK_ICON_SIZE} />
      </TouchableArea>
      <Modal
        name={ModalName.NetworkSelector}
        analyticsProperties={{ isV2Modal: true }}
        isModalOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <Flex p="$spacing16">
          <Text variant="body2" color="$neutral2">
            New network filter
          </Text>
        </Flex>
      </Modal>
    </>
  )
}

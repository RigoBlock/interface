import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea, useMedia } from 'ui/src'
import { zIndexes } from 'ui/src/theme'
import type { TieredNetworkOptions } from 'uniswap/src/components/network/NetworkFilterV2/types'
import { NetworkOption } from 'uniswap/src/components/network/NetworkOption'
import { useNewChainIds } from 'uniswap/src/features/chains/hooks/useNewChainIds'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { SearchTextInput } from 'uniswap/src/features/search/SearchTextInput'
import { isExtensionApp, isWebApp } from 'utilities/src/platform'
import { useEvent } from 'utilities/src/react/hooks'

export interface NetworkFilterContentProps {
  tieredOptions?: TieredNetworkOptions
  selectedChain: UniverseChainId | null
  onPressChain: (chainId: UniverseChainId | null) => void
  includeAllNetworks?: boolean
  chainIds: UniverseChainId[]
}

interface SelectableNetworkOptionProps {
  chainId: UniverseChainId | null
  selectedChain: UniverseChainId | null
  newChains: UniverseChainId[]
  onPressChain: (chainId: UniverseChainId | null) => void
}

function SectionHeader({ title }: { title: string }): JSX.Element {
  const media = useMedia()
  const shouldStickHeader = isExtensionApp || (isWebApp && !media.sm)

  return (
    <Flex
      backgroundColor="$surface1"
      pb="$spacing4"
      pt="$spacing8"
      px="$spacing8"
      zIndex={zIndexes.sticky}
      $platform-web={shouldStickHeader ? { position: 'sticky', top: 0 } : undefined}
    >
      <Text color="$neutral2" variant="body4">
        {title}
      </Text>
    </Flex>
  )
}

function SelectableNetworkOption({
  chainId,
  selectedChain,
  newChains,
  onPressChain,
}: SelectableNetworkOptionProps): JSX.Element {
  const handlePress = useEvent((): void => {
    onPressChain(chainId)
  })

  return (
    <TouchableArea hoverable borderRadius="$rounded8" onPress={handlePress}>
      <NetworkOption
        chainId={chainId}
        currentlySelected={selectedChain === chainId}
        isNew={chainId !== null && newChains.includes(chainId)}
      />
    </TouchableArea>
  )
}

function NetworkOptionRows({
  chainIds,
  selectedChain,
  newChains,
  onPressChain,
}: Omit<SelectableNetworkOptionProps, 'chainId'> & { chainIds: UniverseChainId[] }): JSX.Element {
  return (
    <>
      {chainIds.map((chainId) => (
        <SelectableNetworkOption
          key={chainId}
          chainId={chainId}
          selectedChain={selectedChain}
          newChains={newChains}
          onPressChain={onPressChain}
        />
      ))}
    </>
  )
}

export function NetworkSearchBar(): JSX.Element {
  const { t } = useTranslation()

  return (
    <Flex px="$spacing8" pt="$spacing4" pb="$spacing8">
      {/* TODO(SWAP-2139): Add search functionality */}
      <SearchTextInput
        hideIcon={false}
        placeholder={t('common.input.search') as string}
        py="$spacing8"
        px="$spacing12"
      />
    </Flex>
  )
}

export function NetworkFilterContent({
  tieredOptions,
  selectedChain,
  onPressChain,
  includeAllNetworks,
  chainIds,
}: NetworkFilterContentProps): JSX.Element {
  const { t } = useTranslation()
  const newChains = useNewChainIds()

  const shouldShowTieredOptions = !!tieredOptions?.withBalances.length

  // When tiered options are unavailable or there are no "with balances" entries, show a flat list.
  if (!shouldShowTieredOptions) {
    return (
      <Flex gap="$spacing4" py="$spacing4" pl="$spacing2">
        {includeAllNetworks && (
          <SelectableNetworkOption
            chainId={null}
            selectedChain={selectedChain}
            newChains={newChains}
            onPressChain={onPressChain}
          />
        )}
        <NetworkOptionRows
          chainIds={chainIds}
          selectedChain={selectedChain}
          newChains={newChains}
          onPressChain={onPressChain}
        />
      </Flex>
    )
  }

  const hasOtherNetworks = tieredOptions.otherNetworks.length > 0
  const withBalanceChainIds = tieredOptions.withBalances.map((option) => option.chainId)
  const otherNetworkChainIds = tieredOptions.otherNetworks.map((option) => option.chainId)

  return (
    <Flex gap="$spacing4" py="$spacing4" pl="$spacing2">
      {includeAllNetworks && (
        <SelectableNetworkOption
          chainId={null}
          selectedChain={selectedChain}
          newChains={newChains}
          onPressChain={onPressChain}
        />
      )}

      <SectionHeader title={t('network.filter.withBalances')} />
      <NetworkOptionRows
        chainIds={withBalanceChainIds}
        selectedChain={selectedChain}
        newChains={newChains}
        onPressChain={onPressChain}
      />

      {hasOtherNetworks && (
        <>
          <SectionHeader title={t('network.filter.otherNetworks')} />
          <NetworkOptionRows
            chainIds={otherNetworkChainIds}
            selectedChain={selectedChain}
            newChains={newChains}
            onPressChain={onPressChain}
          />
        </>
      )}
    </Flex>
  )
}

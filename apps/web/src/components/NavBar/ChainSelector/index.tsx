import { UniverseChainId } from '@universe/chains'
import { Flex } from '@universe/mycelium'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { AlertTriangle } from 'ui/src/components/icons/AlertTriangle'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter/NetworkFilter'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useIsSupportedChainIdCallback } from 'uniswap/src/features/chains/hooks/useSupportedChainId'
import { useAccount } from '~/hooks/useAccount'
import { useSelectChain } from '~/hooks/useSelectChain'
import { useMultichainContext } from '~/state/multichain/useMultichainContext'

// The Oct 2026 upstream sync replaced ActionSheetDropdown-based NetworkFilter with a
// popover-based one: `styles`/`hideArrow`/`showUnsupportedConnectedChainWarning` props
// are gone. The unsupported-chain warning is now expressed via a custom trigger
// (previously the warning swapped the logo for a triangle), and the popover manages
// its own scroll tracking, so the old `styles={{ sticky: true }}` is no longer needed.
export const ChainSelector = () => {
  const account = useAccount()
  const { chainId, setSelectedChainId } = useMultichainContext()

  const isSupportedChain = useIsSupportedChainIdCallback()
  const selectChain = useSelectChain()
  const [searchParams, setSearchParams] = useSearchParams()

  const { chains } = useEnabledChains()

  const onSelectChain = useCallback(
    async (targetChainId: UniverseChainId | null) => {
      if (!targetChainId) {
        setSelectedChainId(targetChainId)
      } else {
        await selectChain(targetChainId)
      }
      searchParams.delete('inputCurrency')
      searchParams.delete('outputCurrency')
      searchParams.delete('value')
      searchParams.delete('field')
      targetChainId && searchParams.set('chain', getChainInfo(targetChainId).interfaceName)
      setSearchParams(searchParams)
    },
    [setSelectedChainId, selectChain, searchParams, setSearchParams],
  )

  const isUnsupportedConnectedChain = account.isConnected && !isSupportedChain(account.chainId)

  return (
    <Flex px="$spacing8">
      <NetworkFilter
        selectedChain={chainId ?? null}
        onPressChain={onSelectChain}
        chainIds={chains}
        trigger={
          isUnsupportedConnectedChain
            ? { variant: 'custom', content: <AlertTriangle color="$neutral2" size={20} /> }
            : { variant: 'icon' }
        }
      />
    </Flex>
  )
}

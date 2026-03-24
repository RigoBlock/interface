import { Currency } from '@uniswap/sdk-core'
import { useActiveSmartPool } from '~/state/application/hooks'
import { useCallback, useEffect } from 'react'
import { useMultichainContext } from '~/state/multichain/useMultichainContext'
import { useLocation } from 'react-router'
import { SwitchNetworkAction } from '~/components/Popups/types'
import useSelectChain from '~/hooks/useSelectChain'
import { useSwapAndLimitContext } from '~/state/swap/useSwapContext'
import { RIGOBLOCK_BRIDGE_SUPPORTED_CHAINS } from '~/constants/addresses'
import { Flex } from 'ui/src'
import { TokenSelectorContent } from 'uniswap/src/components/TokenSelector/TokenSelector'
import { TokenSelectorFlow, TokenSelectorVariation } from 'uniswap/src/components/TokenSelector/types'
import { useActiveAddresses } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { InterfaceEventName, ModalName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { CurrencyField } from 'uniswap/src/types/currency'
import { SwapTab } from 'uniswap/src/types/screens/interface'
import { usePrevious } from 'utilities/src/react/hooks'
import { showSwitchNetworkNotification } from '~/utils/showSwitchNetworkNotification'

interface CurrencySearchProps {
  currencyField: CurrencyField
  switchNetworkAction: SwitchNetworkAction
  onCurrencySelect: (currency: Currency) => void
  onDismiss: () => void
  chainIds?: UniverseChainId[]
  variation?: TokenSelectorVariation
}

export function CurrencySearch({
  currencyField,
  switchNetworkAction,
  onCurrencySelect,
  onDismiss,
  chainIds,
  variation,
}: CurrencySearchProps) {
  const addresses = useActiveAddresses()

  const { chainId, setSelectedChainId, isUserSelectedToken, setIsUserSelectedToken, isMultichainContext } =
    useMultichainContext()
  const { currentTab } = useSwapAndLimitContext()
  const prevChainId = usePrevious(chainId)
  const { pathname } = useLocation()

  const selectChain = useSelectChain()
  const { chains } = useEnabledChains()
  const { address: smartPoolAddress } = useActiveSmartPool()

  const handleCurrencySelectTokenSelectorCallback = useCallback(
    async ({ currency }: { currency: Currency }) => {
      if (!isMultichainContext) {
        const correctChain = await selectChain(currency.chainId)

        if (!correctChain) {
          return
        }
      }

      onCurrencySelect(currency)
      setSelectedChainId(currency.chainId)
      setIsUserSelectedToken(true)
      onDismiss()
    },
    [onCurrencySelect, onDismiss, setSelectedChainId, setIsUserSelectedToken, selectChain, isMultichainContext],
  )

  useEffect(() => {
    if ((currentTab !== SwapTab.Swap && currentTab !== SwapTab.Send) || !isMultichainContext) {
      return
    }

    showSwitchNetworkNotification({ chainId, prevChainId, action: switchNetworkAction })
  }, [currentTab, chainId, prevChainId, isMultichainContext, switchNetworkAction])

  return (
    <Trace logImpression eventOnTrigger={InterfaceEventName.TokenSelectorOpened} modal={ModalName.TokenSelectorWeb}>
      <Flex width="100%" flexGrow={1} flexShrink={1} flexBasis="auto">
        <TokenSelectorContent
          renderedInModal={false}
          addresses={addresses}
          isLimits={currentTab === SwapTab.Limit}
          chainId={!isMultichainContext || isUserSelectedToken ? chainId : undefined}
          chainIds={chainIds ?? chains}
          supportedBridgingChains={smartPoolAddress ? RIGOBLOCK_BRIDGE_SUPPORTED_CHAINS : undefined}
          currencyField={currencyField}
          flow={TokenSelectorFlow.Swap}
          isSurfaceReady={true}
          variation={
            variation ??
            (currencyField === CurrencyField.INPUT
              ? TokenSelectorVariation.SwapInput
              : TokenSelectorVariation.SwapOutput)
          }
          onClose={onDismiss}
          onSelectCurrency={handleCurrencySelectTokenSelectorCallback}
        />
      </Flex>
    </Trace>
  )
}

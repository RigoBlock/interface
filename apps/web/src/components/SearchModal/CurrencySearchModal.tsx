import { Currency } from '@uniswap/sdk-core'
import { UniverseChainId } from '@universe/chains'
import { memo } from 'react'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { SNAP_POINTS, useTokenSelectorWebModalDimensions } from 'uniswap/src/components/TokenSelector/TokenSelector'
import { TokenSelectorFlow, TokenSelectorVariation } from 'uniswap/src/components/TokenSelector/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { CurrencyField } from 'uniswap/src/types/currency'
import { SwapTab } from 'uniswap/src/types/screens/interface'
import { CurrencyRow } from '~/components/SearchModal/CurrencyList'
import { CurrencySearch } from '~/components/SearchModal/CurrencySearch'
import styled from '~/lib/deprecated-styled'
import { SwitchNetworkAction } from '~/state/popups/types'

const PoolListWrapper = styled.div`
  width: 100%;
  position: relative;
  display: flex;
  flex-flow: column;
  align-items: center;
`

const PoolListContainer = styled.div`
  width: 100%;
  padding: 32px 25px;
  display: flex;
  flex-flow: column;
  align-items: left;
`

interface CurrencySearchModalProps {
  isOpen: boolean
  onDismiss: () => void
  selectedCurrency?: Currency | null
  onCurrencySelect: (currency: Currency) => void
  switchNetworkAction: SwitchNetworkAction
  otherSelectedCurrency?: Currency | null
  showCurrencyAmount?: boolean
  currencyField?: CurrencyField
  /**
   * Parent-controlled initial network filter. Pass a chain to pin the selector's default network,
   * `null` to default to All Networks, or omit (`undefined`) to fall back to the default
   * account/multichain resolution.
   */
  chainId?: UniverseChainId | null
  chainIds?: UniverseChainId[]
  variation?: TokenSelectorVariation
  flow?: TokenSelectorFlow
  operatedPools?: CurrencyInfo[]
  shouldDisplayPoolsOnly?: boolean
  swapTab?: SwapTab
}

export const CurrencySearchModal = memo(function CurrencySearchModal({
  isOpen,
  onDismiss,
  onCurrencySelect,
  currencyField = CurrencyField.INPUT,
  switchNetworkAction,
  chainId,
  chainIds,
  variation,
  flow,
  operatedPools,
  shouldDisplayPoolsOnly,
  swapTab,
}: CurrencySearchModalProps) {
  const { maxWidth, maxHeight } = useTokenSelectorWebModalDimensions()

  return (
    <Modal
      isModalOpen={isOpen}
      onClose={onDismiss}
      maxHeight={maxHeight}
      height="100vh"
      maxWidth={maxWidth}
      padding={0}
      flex={1}
      name={ModalName.CurrencySearch}
      // The mobile-web sheet must take its height from the snap point, not content-fit: the
      // virtualized token list sizes itself to its container (AutoSizer) so it has no intrinsic
      // height, and a fit-mode sheet opened with cached data freezes at chrome height with an
      // empty list (SWAP-3250).
      snapPoints={SNAP_POINTS}
      snapPointsMode="percent"
    >
      {!shouldDisplayPoolsOnly ? (
        <CurrencySearch
          currencyField={currencyField}
          onCurrencySelect={onCurrencySelect}
          switchNetworkAction={switchNetworkAction}
          onDismiss={onDismiss}
          chainId={chainId}
          chainIds={chainIds}
          variation={variation}
          flow={flow}
          swapTab={swapTab}
        />
      ) : (
        <PoolListWrapper>
          <PoolListContainer>
            {operatedPools?.map((pool) => (
              <CurrencyRow
                key={pool.currencyId}
                currencyInfo={pool}
                onSelect={() => {
                  onCurrencySelect(pool.currency)
                  onDismiss() // TODO: check we want this dismissed on select
                }}
                isSelected={false} // Adjust as needed
                balance={undefined}
                isSmartPool={true}
                eventProperties={{}}
                otherSelected={false}
              />
            ))}
          </PoolListContainer>
        </PoolListWrapper>
      )}
    </Modal>
  )
})

export default CurrencySearchModal

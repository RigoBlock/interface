import { Currency } from '@uniswap/sdk-core'
import { SwitchNetworkAction } from 'components/Popups/types'
import { CurrencyRow } from 'components/SearchModal//CurrencyList'
import { CurrencySearch } from 'components/SearchModal/CurrencySearch'
import styled from 'lib/styled-components'
import { memo } from 'react'
import { Modal } from 'uniswap/src/components/modals/Modal'
import {
  TOKEN_SELECTOR_WEB_MAX_WIDTH,
  TokenSelectorVariation,
} from 'uniswap/src/components/TokenSelector/TokenSelector'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { CurrencyField } from 'uniswap/src/types/currency'

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
  chainIds?: UniverseChainId[]
  variation?: TokenSelectorVariation
  operatedPools?: CurrencyInfo[]
  shouldDisplayPoolsOnly?: boolean
}

export default memo(function CurrencySearchModal({
  isOpen,
  onDismiss,
  onCurrencySelect,
  currencyField = CurrencyField.INPUT,
  switchNetworkAction,
  chainIds,
  variation,
  operatedPools,
  shouldDisplayPoolsOnly,
}: CurrencySearchModalProps) {
  return (
    <Modal
      isModalOpen={isOpen}
      onClose={onDismiss}
      maxHeight={700}
      height="100vh"
      maxWidth={TOKEN_SELECTOR_WEB_MAX_WIDTH}
      padding={0}
      flex={1}
      name={ModalName.CurrencySearch}
    >
      {!shouldDisplayPoolsOnly ? (
        <CurrencySearch
          currencyField={currencyField}
          onCurrencySelect={onCurrencySelect}
          switchNetworkAction={switchNetworkAction}
          onDismiss={onDismiss}
          chainIds={chainIds}
          variation={variation}
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

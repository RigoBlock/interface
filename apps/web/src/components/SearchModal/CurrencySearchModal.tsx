import { Currency, Token } from '@uniswap/sdk-core'
import Modal from 'components/Modal'
import { CurrencySearch } from 'components/SearchModal/CurrencySearch'
import { CurrencySearchFilters, DeprecatedCurrencySearch } from 'components/SearchModal/DeprecatedCurrencySearch'
import TokenSafety from 'components/TokenSafety'
import useLast from 'hooks/useLast'
import { memo, useCallback, useEffect, useState } from 'react'
import { useUserAddedTokens } from 'state/user/userAddedTokens'
import { NAV_HEIGHT } from 'theme'
import { AdaptiveWebModal } from 'ui/src'
import { TOKEN_SELECTOR_WEB_MAX_WIDTH } from 'uniswap/src/components/TokenSelector/TokenSelector'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'
import { CurrencyField } from 'uniswap/src/types/currency'

interface CurrencySearchModalProps {
  isOpen: boolean
  onDismiss: () => void
  selectedCurrency?: Currency | null
  onCurrencySelect: (currency: Currency) => void
  otherSelectedCurrency?: Currency | null
  showCurrencyAmount?: boolean
  hideChainSwitch?: boolean
  currencySearchFilters?: CurrencySearchFilters
  currencyField?: CurrencyField
  operatedPools?: Token[]
}

enum CurrencyModalView {
  search,
  importToken,
  tokenSafety,
}

export default memo(function CurrencySearchModal({
  isOpen,
  onDismiss,
  onCurrencySelect,
  selectedCurrency,
  otherSelectedCurrency,
  showCurrencyAmount = true,
  hideChainSwitch = false,
  currencySearchFilters,
  currencyField = CurrencyField.INPUT,
  operatedPools,
}: CurrencySearchModalProps) {
  const [modalView, setModalView] = useState<CurrencyModalView>(CurrencyModalView.search)
  const lastOpen = useLast(isOpen)
  const userAddedTokens = useUserAddedTokens()
  const multichainFlagEnabled = useFeatureFlag(FeatureFlags.MultichainUX)

  useEffect(() => {
    if (isOpen && !lastOpen) {
      setModalView(CurrencyModalView.search)
    }
  }, [isOpen, lastOpen])

  const showTokenSafetySpeedbump = (token: Token) => {
    setWarningToken(token)
    setModalView(CurrencyModalView.tokenSafety)
  }

  const handleCurrencySelect = useCallback(
    (currency: Currency, hasWarning?: boolean) => {
      if (
        !currencySearchFilters?.onlyDisplaySmartPools &&
        hasWarning &&
        currency.isToken &&
        !userAddedTokens.find((token) => token.equals(currency))
      ) {
        showTokenSafetySpeedbump(currency)
      } else {
        onCurrencySelect(currency)
        onDismiss()
      }
    },
    [onDismiss, onCurrencySelect, userAddedTokens, currencySearchFilters?.onlyDisplaySmartPools],
  )
  // used for token safety
  const [warningToken, setWarningToken] = useState<Token | undefined>()

  let content = null
  switch (modalView) {
    // we use DeprecatedCurrencySearch without multichain flag and for pool select
    case CurrencyModalView.search:
      content = multichainFlagEnabled && !currencySearchFilters?.onlyDisplaySmartPools ? (
        <CurrencySearch
          currencyField={currencyField}
          hideChainSwitch={hideChainSwitch}
          onCurrencySelect={onCurrencySelect}
          onDismiss={onDismiss}
        />
      ) : (
        <DeprecatedCurrencySearch
          isOpen={isOpen}
          onDismiss={onDismiss}
          onCurrencySelect={handleCurrencySelect}
          selectedCurrency={selectedCurrency}
          otherSelectedCurrency={otherSelectedCurrency}
          showCurrencyAmount={showCurrencyAmount}
          hideChainSwitch={hideChainSwitch}
          filters={currencySearchFilters}
          operatedPools={operatedPools}
        />
      )
      break
    case CurrencyModalView.tokenSafety:
      if (warningToken) {
        content = (
          <TokenSafety
            token0={warningToken}
            onContinue={() => handleCurrencySelect(warningToken)}
            onCancel={() => setModalView(CurrencyModalView.search)}
            showCancel={true}
          />
        )
      }
      break
  }
  return multichainFlagEnabled ? (
    <AdaptiveWebModal
      isOpen={isOpen}
      onClose={onDismiss}
      maxHeight={modalView === CurrencyModalView.tokenSafety ? 400 : 700}
      maxWidth={TOKEN_SELECTOR_WEB_MAX_WIDTH}
      px={0}
      py={0}
      flex={1}
      $sm={{ height: `calc(100dvh - ${NAV_HEIGHT}px)` }}
    >
      {content}
    </AdaptiveWebModal>
  ) : (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      height="90vh"
      maxHeight={modalView === CurrencyModalView.tokenSafety ? 400 : 700}
    >
      {content}
    </Modal>
  )
})

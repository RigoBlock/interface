import { Currency } from '@uniswap/sdk-core'
import { darken } from 'polished'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'react-feather'
import { Trans, useTranslation } from 'react-i18next'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { nativeOnChain, USDC_HYPEREVM } from 'uniswap/src/constants/tokens'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useIsSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { ReactComponent as DropDown } from '~/assets/images/dropdown.svg'
import { ButtonGray, ButtonPrimary } from '~/components/Button/buttons'
import { AutoColumn } from '~/components/deprecated/Column'
import { RowBetween, RowFixed } from '~/components/deprecated/Row'
import CurrencyLogo from '~/components/Logo/CurrencyLogo'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import NameInputPanel from '~/components/NameInputPanel'
import { SwitchNetworkAction } from '~/components/Popups/types'
import CurrencySearchModal from '~/components/SearchModal/CurrencySearchModal'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import { useCreateCallback } from '~/state/pool/hooks'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'
import { ThemedText } from '~/theme/components/text'

const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const CurrencySelect = styled(ButtonGray)<{
  $visible: boolean
  $selected: boolean
  $hideInput?: boolean
  disabled?: boolean
}>`
  align-items: center;
  background-color: ${({ $selected, theme }) => ($selected ? theme.surface1 : theme.accent1)};
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
  box-shadow: ${({ $selected }) => ($selected ? 'none' : '0px 6px 10px rgba(0, 0, 0, 0.075)')};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  color: ${({ $selected, theme }) => ($selected ? theme.neutral1 : theme.white)};
  cursor: pointer;
  border-radius: 16px;
  outline: none;
  user-select: none;
  border: none;
  font-size: 24px;
  font-weight: 500;
  height: ${({ $hideInput }) => ($hideInput ? '2.8rem' : '2.4rem')};
  width: ${({ $hideInput }) => ($hideInput ? '100%' : 'initial')};
  padding: 0 8px;
  justify-content: space-between;
  margin-left: ${({ $hideInput }) => ($hideInput ? '0' : '12px')};
  :focus,
  :hover {
    background-color: ${({ $selected, theme }) => ($selected ? theme.surface2 : darken(0.05, theme.accent1))};
  }
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const StyledDropDown = styled(DropDown)<{ $selected: boolean }>`
  margin: 0 0.25rem 0 0.35rem;
  height: 35%;

  path {
    stroke: ${({ $selected, theme }) => ($selected ? theme.neutral1 : theme.white)};
    stroke-width: 1.5px;
  }
`

const StyledTokenName = styled.span<{ $active?: boolean }>`
  ${({ $active }) => ($active ? '  margin: 0 0.25rem 0 0.25rem;' : '  margin: 0 0.25rem 0 0.25rem;')}
  font-size: 20px;
`

interface CreateModalProps {
  isOpen: boolean
  onDismiss: () => void
  title: ReactNode
}

const MODAL_TRANSITION_DURATION = 200

export default function CreateModal({ isOpen, onDismiss, title }: CreateModalProps) {
  // state for create input
  const [typedName, setTypedName] = useState('')
  const [typedSymbol, setTypedSymbol] = useState('')
  //const [currencySearchModalOpen, setCurrencySearchModalOpen] = useState(false)
  const [currencyValue, setCurrencyValue] = useState<Currency>()
  const [isSearchingCurrency, setIsSearchingCurrency] = useState<boolean>(false)
  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>()

  // by memoizing native, new chain native currency is stored on switch chain
  const account = useAccount()
  const isHyperEvm = account.chainId === UniverseChainId.HyperEvm
  // HyperEVM pools must be USDC-based (native base token is not supported there)
  const defaultCurrency = useMemo(
    () => (isHyperEvm ? USDC_HYPEREVM : nativeOnChain(account.chainId ?? 1)),
    [account.chainId, isHyperEvm],
  )
  const chainLabel = account.chainId ? getChainInfo(account.chainId).label : undefined

  // TODO: as native is memoized now, we can simply set currency value, probably not needed to
  // update currency at initialization or on chain switch
  useEffect(() => {
    if (!currencyValue?.chainId || currencyValue.chainId !== account.chainId) {
      setCurrencyValue(defaultCurrency)
    }
  }, [account.chainId, currencyValue?.chainId, defaultCurrency])

  const handleCurrencySelect = useCallback((currency: Currency) => {
    setCurrencyValue(currency)
    setCreateError(undefined)
    setIsSearchingCurrency(false)
  }, [])

  // wrapped onUserInput to clear signatures
  const onNameInput = useCallback((name: string) => {
    setTypedName(name)
  }, [])

  const onSymbolInput = useCallback((symbol: string) => {
    setTypedSymbol(symbol.toUpperCase())
  }, [])

  const { t } = useTranslation()
  const createCallback = useCreateCallback()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setAttempting(false)
      setTypedName('')
      setTypedSymbol('')
      setCreateError(undefined)
      setCurrencyValue(defaultCurrency)
    }, MODAL_TRANSITION_DURATION)
  }

  async function onCreate() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!account.address || !account.chainId) {
      return
    }

    // try deploy pool and store hash
    const txHash = await createCallback({
      name: typedName,
      symbol: typedSymbol,
      currencyValue,
    })?.catch((error) => {
      setAttempting(false)
      setCreateError(error instanceof Error ? error.message : String(error))
      logger.info('CreateModal', 'onCreate', error)
    })

    if (txHash) {
      setHash(txHash)
    }
  }

  const chainAllowed = useIsSupportedChainId(account.chainId) || isHyperEvm

  return (
    <>
      {isSearchingCurrency ? (
        <CurrencySearchModal
          isOpen={true}
          onDismiss={() => setIsSearchingCurrency(false)}
          switchNetworkAction={SwitchNetworkAction.PoolFinder}
          onCurrencySelect={handleCurrencySelect}
          selectedCurrency={currencyValue ?? null}
          showCurrencyAmount={false}
          shouldDisplayPoolsOnly={false}
          chainIds={isHyperEvm ? [UniverseChainId.HyperEvm] : undefined}
        />
      ) : (
        <Modal
          name={ModalName.DappRequest}
          isModalOpen={isOpen}
          isDismissible
          onClose={wrappedOnDismiss}
          maxHeight={600}
        >
          {!attempting && !hash && (
            <ContentWrapper gap="lg">
              <AutoColumn gap="lg" justify="center">
                <RowBetween>
                  <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
                  <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
                </RowBetween>
                <ThemedText.DeprecatedBody>
                  <Trans>Choose a cool name, a symbol and the base token.</Trans>
                </ThemedText.DeprecatedBody>
                {chainLabel && (
                  <ThemedText.DeprecatedSubHeader>
                    <Trans>Will be created on {chainLabel}</Trans>
                  </ThemedText.DeprecatedSubHeader>
                )}
                <NameInputPanel value={typedName} onChange={onNameInput} />
                <NameInputPanel
                  value={typedSymbol}
                  onChange={onSymbolInput}
                  label="Pool Symbol"
                  placeholder="max 5 characters"
                />
                <CurrencySelect
                  disabled={!chainAllowed}
                  $visible={true}
                  $selected={true}
                  $hideInput={false}
                  className="open-currency-select-button"
                  onClick={() => setIsSearchingCurrency(true)}
                >
                  <Aligner>
                    <RowFixed>
                      {currencyValue ? (
                        <CurrencyLogo style={{ marginRight: '0.5rem' }} currency={currencyValue} size={24} />
                      ) : null}
                      <StyledTokenName
                        className="token-symbol-container"
                        $active={Boolean(currencyValue && currencyValue.symbol)}
                      >
                        {(currencyValue && currencyValue.symbol && currencyValue.symbol.length > 20
                          ? currencyValue.symbol.slice(0, 4) +
                            '...' +
                            currencyValue.symbol.slice(currencyValue.symbol.length - 5, currencyValue.symbol.length)
                          : currencyValue?.symbol) || <Trans>Select a token</Trans>}
                      </StyledTokenName>
                    </RowFixed>
                    <StyledDropDown $selected={!!currencyValue} />
                  </Aligner>
                </CurrencySelect>
                <ButtonPrimary
                  disabled={Boolean(
                    typedName === '' ||
                    typedName.length < 4 ||
                    typedName.length > 31 ||
                    typedSymbol === '' ||
                    typedSymbol.length < 3 ||
                    typedSymbol.length > 5,
                  )}
                  onClick={onCreate}
                >
                  <ThemedText.DeprecatedMediumHeader color="white">
                    <Trans>Create Smart Pool</Trans>
                  </ThemedText.DeprecatedMediumHeader>
                </ButtonPrimary>
                {createError && (
                  <ThemedText.DeprecatedBody
                    style={{
                      color: '#ff6b6b',
                      wordBreak: 'break-all',
                      fontSize: '12px',
                    }}
                  >
                    {t('pool.create.error.createFailed', {
                      error: createError,
                    })}
                  </ThemedText.DeprecatedBody>
                )}
              </AutoColumn>
            </ContentWrapper>
          )}
          {attempting && !hash && (
            <LoadingView onDismiss={wrappedOnDismiss}>
              <AutoColumn gap="12px" justify="center">
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Creating Smart Pool</Trans>
                </ThemedText.DeprecatedLargeHeader>
              </AutoColumn>
            </LoadingView>
          )}
          {hash && (
            <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
              <AutoColumn gap="12px" justify="center">
                {!confirmed ? (
                  <ThemedText.DeprecatedLargeHeader>
                    <Trans>Transaction Submitted</Trans>
                  </ThemedText.DeprecatedLargeHeader>
                ) : transactionSuccess ? (
                  <ThemedText.DeprecatedLargeHeader>
                    <Trans>Transaction Success</Trans>
                  </ThemedText.DeprecatedLargeHeader>
                ) : (
                  <ThemedText.DeprecatedLargeHeader>
                    <Trans>Transaction Failed</Trans>
                  </ThemedText.DeprecatedLargeHeader>
                )}
              </AutoColumn>
            </SubmittedView>
          )}
        </Modal>
      )}
    </>
  )
}

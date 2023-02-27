import { isAddress } from '@ethersproject/address'
import { Trans } from '@lingui/macro'
import { Currency } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { darken } from 'polished'
import { ReactNode, useCallback, useState } from 'react'
import { X } from 'react-feather'
import styled from 'styled-components/macro'

import { ReactComponent as DropDown } from '../../assets/images/dropdown.svg'
import { isSupportedChain } from '../../constants/chains'
import { ZERO_ADDRESS } from '../../constants/misc'
import { GRG } from '../../constants/tokens'
import useENS from '../../hooks/useENS'
//import { useTokenBalance } from '../../state/connection/hooks'
// TODO: move useCreateCallback ourside of governance hooks
import { useCreateCallback } from '../../state/governance/hooks'
import { ThemedText } from '../../theme'
import { ButtonGray, ButtonPrimary } from '../Button'
//import { ButtonError } from '../Button'
import { AutoColumn } from '../Column'
import CurrencyLogo from '../Logo/CurrencyLogo'
import Modal from '../Modal'
import { LoadingView, SubmittedView } from '../ModalViews'
import NameInputPanel from '../NameInputPanel'
import { RowBetween, RowFixed } from '../Row'
import CurrencySearchModal from '../SearchModal/CurrencySearchModal'

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
  visible: boolean
  selected: boolean
  hideInput?: boolean
  disabled?: boolean
}>`
  align-items: center;
  background-color: ${({ selected, theme }) => (selected ? theme.deprecated_bg2 : theme.deprecated_primary1)};
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
  box-shadow: ${({ selected }) => (selected ? 'none' : '0px 6px 10px rgba(0, 0, 0, 0.075)')};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  color: ${({ selected, theme }) => (selected ? theme.deprecated_text1 : theme.deprecated_white)};
  cursor: pointer;
  border-radius: 16px;
  outline: none;
  user-select: none;
  border: none;
  font-size: 24px;
  font-weight: 500;
  height: ${({ hideInput }) => (hideInput ? '2.8rem' : '2.4rem')};
  width: ${({ hideInput }) => (hideInput ? '100%' : 'initial')};
  padding: 0 8px;
  justify-content: space-between;
  margin-left: ${({ hideInput }) => (hideInput ? '0' : '12px')};
  :focus,
  :hover {
    background-color: ${({ selected, theme }) =>
      selected ? theme.deprecated_bg3 : darken(0.05, theme.deprecated_primary1)};
  }
  visibility: ${({ visible }) => (visible ? 'visible' : 'hidden')};
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const StyledDropDown = styled(DropDown)<{ selected: boolean }>`
  margin: 0 0.25rem 0 0.35rem;
  height: 35%;

  path {
    stroke: ${({ selected, theme }) => (selected ? theme.deprecated_text1 : theme.deprecated_white)};
    stroke-width: 1.5px;
  }
`

const StyledTokenName = styled.span<{ active?: boolean }>`
  ${({ active }) => (active ? '  margin: 0 0.25rem 0 0.25rem;' : '  margin: 0 0.25rem 0 0.25rem;')}
  font-size: 20px;
`

interface CreateModalProps {
  isOpen: boolean
  onDismiss: () => void
  title: ReactNode
}

// TODO: 'scrollOverlay' prop returns warning in console
export default function CreateModal({ isOpen, onDismiss, title }: CreateModalProps) {
  const { account, chainId } = useWeb3React()

  // state for create input
  const [typedName, setTypedName] = useState('')
  const [typedSymbol, setTypedSymbol] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  // TODO: check if should use network base currency default instead of GRG
  const [currencyValue, setCurrencyValue] = useState<Currency>(GRG[chainId ?? 1])

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  const handleCurrencySelect = useCallback(
    (currency: Currency) => {
      setCurrencyValue(currency)
    },
    [setCurrencyValue]
  )

  // wrapped onUserInput to clear signatures
  const onNameInput = useCallback((typedName: string) => {
    setTypedName(typedName)
  }, [])

  const onSymbolInput = useCallback((typedSymbol: string) => {
    setTypedSymbol(typedSymbol.toUpperCase())
  }, [])

  const { address: parsedAddress } = useENS(currencyValue.isNative ? ZERO_ADDRESS : currencyValue.address)

  const createCallback = useCreateCallback()

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onCreate() {
    setAttempting(true)

    // if callback not returned properly ignore
    if (!account || !chainId || !createCallback || !parsedAddress) return

    // try delegation and store hash
    const hash = await createCallback(typedName, typedSymbol, parsedAddress)?.catch((error) => {
      setAttempting(false)
      console.log(error)
    })

    if (hash) {
      setHash(hash)
    }
  }

  const chainAllowed = isSupportedChain(chainId)

  return (
    <Modal isOpen={isOpen} onDismiss={wrappedOnDismiss} maxHeight={90}>
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
            <NameInputPanel value={typedName} onChange={onNameInput} />
            <NameInputPanel
              value={typedSymbol}
              onChange={onSymbolInput}
              label="Pool Symbol"
              placeholder="max 5 characters"
            />
            <CurrencySelect
              disabled={!chainAllowed}
              visible={true}
              selected={false}
              hideInput={false}
              className="open-currency-select-button"
              onClick={() => {
                setModalOpen(true)
              }}
            >
              <Aligner>
                <RowFixed>
                  {currencyValue ? (
                    <CurrencyLogo style={{ marginRight: '0.5rem' }} currency={currencyValue} size="24px" />
                  ) : null}
                  <StyledTokenName
                    className="token-symbol-container"
                    active={Boolean(currencyValue && currencyValue.symbol)}
                  >
                    {(currencyValue && currencyValue.symbol && currencyValue.symbol.length > 20
                      ? currencyValue.symbol.slice(0, 4) +
                        '...' +
                        currencyValue.symbol.slice(currencyValue.symbol.length - 5, currencyValue.symbol.length)
                      : currencyValue?.symbol) || <Trans>Select a token</Trans>}
                  </StyledTokenName>
                </RowFixed>
                <StyledDropDown selected={!!currencyValue} />
              </Aligner>
            </CurrencySelect>
            <ButtonPrimary
              disabled={
                typedName === '' ||
                typedName.length > 32 ||
                typedSymbol === '' ||
                typedSymbol.length > 5 ||
                !isAddress(parsedAddress ?? '')
              }
              onClick={onCreate}
            >
              <ThemedText.DeprecatedMediumHeader color="white">
                <Trans>Create New Pool</Trans>
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
          </AutoColumn>
          <CurrencySearchModal
            isOpen={modalOpen}
            onDismiss={handleDismissSearch}
            onCurrencySelect={handleCurrencySelect}
            selectedCurrency={currencyValue}
            showCommonBases={true}
            showCurrencyAmount={false}
            disableNonToken={false}
          />
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Creating new Pool</Trans>
            </ThemedText.DeprecatedLargeHeader>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Transaction Submitted</Trans>
            </ThemedText.DeprecatedLargeHeader>
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

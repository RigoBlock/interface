/* oxlint-disable complexity */
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { darken } from 'polished'
import { HTMLProps, ReactNode, useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { breakpoints } from 'ui/src/theme'
import { CurrencyLogo } from 'uniswap/src/components/CurrencyLogo/CurrencyLogo'
import { useIsSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'
import { Locale } from 'uniswap/src/features/language/constants'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ElementName, SwapEventName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { CurrencyField } from 'uniswap/src/types/currency'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { NumberType } from 'utilities/src/format/types'
import { ReactComponent as DropDown } from '~/assets/images/dropdown.svg'
import { ButtonGray } from '~/components/Button/buttons'
import { FiatValue } from '~/features/Swap/CurrencyInputPanel/FiatValue'
import { LoadingOpacityContainer, loadingOpacityMixin } from '~/components/Loader/styled'
import { DoubleCurrencyLogo } from '~/components/Logo/DoubleLogo'
import { SwitchNetworkAction } from '~/state/popups/types'
import CurrencySearchModal from '~/components/SearchModal/CurrencySearchModal'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import { useActiveSmartPool } from '~/state/application/hooks'
import { useCurrencyBalance } from '~/state/connection/hooks'
import { flexColumnNoWrap, flexRowNoWrap } from '~/theme/styles'
import { escapeRegExp } from '~/utils/escapeRegExp'

const InputPanel = styled.div<{ $hideInput?: boolean }>`
  ${flexColumnNoWrap};
  position: relative;
  border-radius: ${({ $hideInput }) => ($hideInput ? '16px' : '20px')};
  background-color: ${({ theme, $hideInput }) => ($hideInput ? 'transparent' : theme.surface2)};

  z-index: 1;
  width: ${({ $hideInput }) => ($hideInput ? '100%' : 'initial')};
  transition: height 1s ease;
  will-change: height;
`

const Container = styled.div<{ $hideInput: boolean; $disabled: boolean }>`
  border-radius: ${({ $hideInput }) => ($hideInput ? '16px' : '20px')};
  border: 1px solid ${({ theme }) => theme.surface3};
  background-color: ${({ theme }) => theme.surface2};
  width: ${({ $hideInput }) => ($hideInput ? '100%' : 'initial')};
  ${({ theme, $hideInput, $disabled }) =>
    !$disabled &&
    `
    :focus,
    :hover {
      border: 1px solid ${$hideInput ? ' transparent' : theme.surface2};
    }
  `}
`

const CurrencySelect = styled(ButtonGray)<{
  $visible: boolean
  $selected: boolean
  $hideInput?: boolean
  disabled?: boolean
  $pointerEvents?: string
}>`
  align-items: center;
  background-color: ${({ $selected, theme }) => ($selected ? theme.surface1 : theme.accent1)};
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
  box-shadow: ${({ theme }) => theme.deprecated_shallowShadow};
  color: ${({ $selected, theme }) => ($selected ? theme.neutral1 : theme.white)};
  cursor: pointer;
  border-radius: 16px;
  outline: none;
  user-select: none;
  border: none;
  font-size: 24px;
  font-weight: 535;
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
  ${({ $pointerEvents }) => $pointerEvents && `pointer-events: none`}
`

const InputRow = styled.div<{ $selected: boolean }>`
  ${flexRowNoWrap};
  align-items: center;
  justify-content: space-between;
  padding: ${({ $selected }) => ($selected ? ' 1rem 1rem 0.75rem 1rem' : '1rem 1rem 1rem 1rem')};
`

const LabelRow = styled.div`
  ${flexRowNoWrap};
  align-items: center;
  color: ${({ theme }) => theme.neutral1};
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0 1rem 1rem;
  span:hover {
    cursor: pointer;
    color: ${({ theme }) => darken(0.2, theme.neutral2)};
  }
`

const FiatRow = styled(LabelRow)`
  justify-content: flex-end;
  padding: 0px 1rem 0.75rem;
  height: 32px;
`

// note the line height 0 ensures even if we change font/font-size it doesn't break centering
const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  line-height: 0px;
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
  white-space: nowrap;

  @media screen and (max-width: ${breakpoints.md}px) {
    font-size: 16px;
  }
`

const StyledBalanceMax = styled.button<{ disabled?: boolean }>`
  background-color: transparent;
  background-color: ${({ theme }) => theme.accent2};
  border: none;
  border-radius: 12px;
  color: ${({ theme }) => theme.accent1};
  cursor: pointer;
  font-size: 11px;
  font-weight: 535;
  margin-left: 0.25rem;
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
  padding: 4px 6px;
  pointer-events: ${({ disabled }) => (!disabled ? 'initial' : 'none')};

  :hover {
    opacity: ${({ disabled }) => (!disabled ? 0.8 : 0.4)};
  }

  :focus {
    outline: none;
  }
`

const DeprecatedRow = styled.div<{ align?: string; justify?: string }>`
  width: 100%;
  display: flex;
  padding: 0;
  align-items: ${({ align }) => align ?? 'center'};
  justify-content: ${({ justify }) => justify ?? 'flex-start'};
`

/** @deprecated Please use `Flex` from `ui/src` going forward */
const RowBetween = styled(DeprecatedRow)`
  justify-content: space-between;
`

/** @deprecated Please use `Flex` from `ui/src` going forward */
const RowFixed = styled(DeprecatedRow)`
  position: relative;
  width: fit-content;
`

const BalanceLabel = styled.span`
  color: ${({ theme }) => theme.neutral3};
  font-weight: 535;
  font-size: 14px;
  display: inline;
  cursor: pointer;
`

// Apollo-backed balance prefetching was removed upstream with the appGraphql layer; the wrapper is
// kept as a plain styled container so the currency select keeps its original layout behavior.
const StyledSelectWrapper = styled.div<{ $fullWidth: boolean }>`
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
`

const DeprecatedStyledInput = styled.input<{
  error?: boolean
  fontSize?: string
  align?: string
  disabled?: boolean
}>`
  color: ${({ error, theme }) => (error ? theme.critical : theme.neutral1)};
  pointer-events: ${({ disabled }) => (disabled ? 'none' : 'auto')};
  width: 0;
  position: relative;
  font-weight: 485;
  outline: none;
  border: none;
  flex: 1 1 auto;
  background-color: transparent;
  font-size: ${({ fontSize }) => fontSize ?? '28px'};
  text-align: ${({ align }) => align && align};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0px;
  -webkit-appearance: textfield;
  text-align: right;

  ::placeholder {
    color: ${({ theme }) => theme.neutral3};
  }
`

const inputRegex = RegExp(`^\\d*(?:\\\\[.])?\\d*$`) // match escaped "." characters via in a non-capturing group

function isInputGreaterThanDecimals(value: string, maxDecimals?: number): boolean {
  const decimalGroups = value.split('.')
  return !!maxDecimals && decimalGroups.length > 1 && decimalGroups[1].length > maxDecimals
}

interface NumericalInputProps extends Omit<HTMLProps<HTMLInputElement>, 'ref' | 'onChange' | 'as'> {
  value: string | number
  onUserInput: (input: string) => void
  error?: boolean
  fontSize?: string
  align?: 'right' | 'left'
  prependSymbol?: string
  maxDecimals?: number
  testId?: string
}

// Local copy of the deprecated web NumericalInput: upstream replaced the web input with a
// cross-platform component (onChangeText/editable), while this panel still needs the raw DOM input.
const NumericalInput = function NumericalInput({
  value,
  onUserInput,
  placeholder,
  prependSymbol,
  maxDecimals,
  testId,
  ...rest
}: NumericalInputProps) {
  const locale = useCurrentLocale()

  const enforcer = (nextUserInput: string) => {
    if (nextUserInput === '' || inputRegex.test(escapeRegExp(nextUserInput))) {
      if (isInputGreaterThanDecimals(nextUserInput, maxDecimals)) {
        return
      }

      onUserInput(nextUserInput)
    }
  }

  const formatValueWithLocale = (val: string | number) => {
    const [searchValue, replaceValue] = localeUsesComma(locale) ? [/\./g, ','] : [/,/g, '.']
    return val.toString().replace(searchValue, replaceValue)
  }

  const valueFormattedWithLocale = formatValueWithLocale(value)

  return (
    <DeprecatedStyledInput
      {...rest}
      value={prependSymbol && value ? prependSymbol + valueFormattedWithLocale : valueFormattedWithLocale}
      data-testid={testId}
      onChange={(event) => {
        if (prependSymbol) {
          const rawValue = event.target.value
          const formattedValue = rawValue.toString().includes(prependSymbol)
            ? rawValue.toString().slice(prependSymbol.length, rawValue.toString().length + 1)
            : rawValue
          enforcer(formattedValue.replace(/,/g, '.'))
        } else {
          enforcer(event.target.value.replace(/,/g, '.'))
        }
      }}
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      type="text"
      pattern="^[0-9]*[.,]?[0-9]*$"
      placeholder={placeholder || '0'}
      minLength={1}
      maxLength={79}
      spellCheck="false"
    />
  )
}

function localeUsesComma(locale: Locale): boolean {
  const decimalSeparator = new Intl.NumberFormat(locale).format(1.1)[1]
  return decimalSeparator === ','
}

const StyledNumericalInput = styled(NumericalInput)<{ $loading: boolean }>`
  ${loadingOpacityMixin};
  text-align: left;
`

interface CurrencyInputPanelProps {
  value: string
  onUserInput: (value: string) => void
  onMax?: () => void
  showMaxButton: boolean
  label?: ReactNode
  onCurrencySelect?: (currency: Currency) => void
  currency?: Currency | null
  hideBalance?: boolean
  pair?: Pair | null
  hideInput?: boolean
  otherCurrency?: Currency | null
  fiatValue?: { data?: number; isLoading: boolean }
  id: string
  showCurrencyAmount?: boolean
  isAccount?: boolean
  renderBalance?: (amount: CurrencyAmount<Currency>) => ReactNode
  locked?: boolean
  loading?: boolean
  currencyField?: CurrencyField
}

export default function CurrencyInputPanel({
  value,
  onUserInput,
  onMax,
  showMaxButton,
  onCurrencySelect,
  currency,
  otherCurrency,
  id,
  showCurrencyAmount,
  currencyField,
  isAccount,
  renderBalance,
  fiatValue,
  hideBalance = false,
  pair = null, // used for double token logo
  hideInput = false,
  locked = false,
  loading = false,
  ...rest
}: CurrencyInputPanelProps) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)
  const account = useAccount()
  const chainAllowed = useIsSupportedChainId(account.chainId)
  const { address: smartPoolAddress } = useActiveSmartPool()
  // TODO: check if should invert definition and modify swap currency input panel
  const selectedCurrencyBalance = useCurrencyBalance(
    !isAccount ? (smartPoolAddress ?? undefined) : account.address,
    currency ?? undefined,
  )
  const { formatCurrencyAmount } = useLocalizationContext()
  const currencyLogoInfo = useCurrencyInfo(currency ? currencyId(currency) : undefined)

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  return (
    <InputPanel id={id} $hideInput={hideInput} {...rest}>
      {!locked && (
        <>
          <Container $hideInput={hideInput} $disabled={!chainAllowed}>
            <InputRow style={hideInput ? { padding: '0', borderRadius: '8px' } : {}} $selected={!onCurrencySelect}>
              {!hideInput && (
                <StyledNumericalInput
                  className="token-amount-input"
                  value={value}
                  onUserInput={onUserInput}
                  disabled={!chainAllowed}
                  $loading={loading}
                  maxDecimals={currency?.decimals}
                />
              )}

              <StyledSelectWrapper $fullWidth={hideInput}>
                <CurrencySelect
                  disabled={!chainAllowed}
                  $visible={currency !== undefined}
                  $selected={!!currency}
                  $hideInput={hideInput}
                  className="open-currency-select-button"
                  onClick={() => {
                    if (onCurrencySelect) {
                      setModalOpen(true)
                    }
                  }}
                  $pointerEvents={!onCurrencySelect ? 'none' : undefined}
                >
                  <Aligner>
                    <RowFixed>
                      {pair ? (
                        <span style={{ marginRight: '0.5rem' }}>
                          <DoubleCurrencyLogo currencies={[pair.token0, pair.token1]} size={24} />
                        </span>
                      ) : (
                        currencyLogoInfo && (
                          <span style={{ marginRight: '0.5rem' }}>
                            <CurrencyLogo currencyInfo={currencyLogoInfo} size={24} />
                          </span>
                        )
                      )}
                      {pair ? (
                        <StyledTokenName className="pair-name-container">
                          {pair.token0.symbol}:{pair.token1.symbol}
                        </StyledTokenName>
                      ) : (
                        <StyledTokenName
                          className="token-symbol-container"
                          $active={Boolean(currency && currency.symbol)}
                        >
                          {(currency && currency.symbol && currency.symbol.length > 20
                            ? currency.symbol.slice(0, 4) +
                              '...' +
                              currency.symbol.slice(currency.symbol.length - 5, currency.symbol.length)
                            : currency?.symbol) || <Trans i18nKey="tokens.selector.button.choose" />}
                        </StyledTokenName>
                      )}
                    </RowFixed>
                    {onCurrencySelect && <StyledDropDown $selected={!!currency} />}
                  </Aligner>
                </CurrencySelect>
              </StyledSelectWrapper>
            </InputRow>
            {Boolean(!hideInput && !hideBalance && currency) && (
              <FiatRow>
                <RowBetween>
                  <LoadingOpacityContainer $loading={loading}>
                    {fiatValue && <FiatValue fiatValue={fiatValue} />}
                  </LoadingOpacityContainer>
                  <RowFixed style={{ height: '17px' }}>
                    <BalanceLabel onClick={onMax}>
                      {Boolean(!hideBalance && currency && selectedCurrencyBalance) &&
                        (renderBalance?.(selectedCurrencyBalance as CurrencyAmount<Currency>) || (
                          <Trans
                            i18nKey="swap.balance.amount"
                            values={{
                              amount: formatCurrencyAmount({
                                value: selectedCurrencyBalance,
                                type: NumberType.TokenNonTx,
                                placeholder: '',
                              }),
                            }}
                          />
                        ))}
                    </BalanceLabel>
                    {Boolean(showMaxButton && selectedCurrencyBalance) && (
                      <Trace
                        logPress
                        eventOnTrigger={SwapEventName.SwapPresetTokenAmountSelected}
                        element={ElementName.MaxTokenAmountButton}
                      >
                        <StyledBalanceMax onClick={onMax}>{t('common.max').toUpperCase()}</StyledBalanceMax>
                      </Trace>
                    )}
                  </RowFixed>
                </RowBetween>
              </FiatRow>
            )}
          </Container>
        </>
      )}
      {onCurrencySelect && (
        <CurrencySearchModal
          isOpen={modalOpen}
          onDismiss={handleDismissSearch}
          switchNetworkAction={SwitchNetworkAction.PoolFinder}
          onCurrencySelect={onCurrencySelect}
          selectedCurrency={currency}
          otherSelectedCurrency={otherCurrency}
          showCurrencyAmount={showCurrencyAmount}
          currencyField={currencyField}
        />
      )}
    </InputPanel>
  )
}

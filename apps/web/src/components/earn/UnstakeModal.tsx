import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'react-feather'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Text, useSporeColors } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { GRG } from 'uniswap/src/constants/tokens'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { /*ButtonConfirmed,*/ ButtonPrimary } from '~/components/Button/buttons'
//import { ButtonError } from '../Button'
import { LightCard } from '~/components/Card/cards'
import { AutoColumn } from '~/components/deprecated/Column'
import { RowBetween } from '~/components/deprecated/Row'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import Slider from '~/components/Slider'
import { ResponsiveHeaderText } from '~/components/vote/DelegateModal'
import { useAccount } from '~/hooks/useAccount'
import useSelectChain from '~/hooks/useSelectChain'
import useDebouncedChangeHandler from '~/hooks/useDebouncedChangeHandler'
import styled from '~/lib/deprecated-styled'
import { useRemoveLiquidityModalContext } from '~/pages/RemoveLiquidity/RemoveLiquidityModalContext'
import { ClickablePill } from '~/pages/Swap/Buy/PredefinedAmount'
import { useUnstakeCallback } from '~/state/stake/hooks'
import { type FreeStakeBalanceByChain } from '~/state/stake/useMultiChainFreeStakeBalances'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'
import { ThemedText } from '~/theme/components/text'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 24px;
`

const StyledClosed = styled(X)`
  :hover {
    cursor: pointer;
  }
`

const ChainPill = styled(Button)`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.surface2};
  color: ${({ theme }) => theme.neutral1};
  border: 1px solid ${({ theme }) => theme.surface3};

  &[data-active='true'] {
    background-color: ${({ theme }) => theme.accent2};
    border-color: ${({ theme }) => theme.accent1};
  }
`

export type UnstakeChainOption = FreeStakeBalanceByChain

interface UnstakeModalProps {
  isOpen: boolean
  isPool?: boolean
  chains: UnstakeChainOption[]
  onDismiss: () => void
  title: ReactNode
}

// TODO: add balance input to display amount when withdrawing
export default function UnstakeModal({ isOpen, isPool, chains, onDismiss, title }: UnstakeModalProps) {
  const account = useAccount()
  const selectChain = useSelectChain()
  const { t } = useTranslation()
  const colors = useSporeColors()
  const { formatCurrencyAmount } = useLocalizationContext()

  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (chains.length === 0) {
      setSelectedChainId(undefined)
      return
    }
    const connectedOption = chains.find((c) => c.chainId === account.chainId)
    setSelectedChainId(connectedOption?.chainId ?? chains[0].chainId)
  }, [chains, account.chainId, isOpen])

  const selectedChain = useMemo(
    () => chains.find((c) => c.chainId === selectedChainId),
    [chains, selectedChainId],
  )

  const unstakeChainId = selectedChain?.chainId ?? account.chainId ?? UniverseChainId.Mainnet
  const chainInfo = getChainInfo(unstakeChainId)
  const currencyValue = GRG[unstakeChainId]

  const freeStakeBalance = selectedChain?.freeStakeBalance

  const { percent, setPercent } = useRemoveLiquidityModalContext()

  // Reset the slider when the selected chain changes so the user doesn't accidentally
  // unstake a different amount on a different chain.
  useEffect(() => {
    setPercent('0')
  }, [selectedChainId, setPercent])

  const onPercentSelect = useCallback(
    (value: number) => {
      setPercent(value.toString())
    },
    [setPercent],
  )

  const [percentForSlider, onPercentSelectForSlider] = useDebouncedChangeHandler(Number(percent), onPercentSelect)
  const parsedAmount = CurrencyAmount.fromRawAmount(
    currencyValue,
    JSBI.divide(
      JSBI.multiply(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(percentForSlider)),
      JSBI.BigInt(100),
    ),
  )

  const unstakeCallback = useUnstakeCallback(unstakeChainId)

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [stakeAmount, setStakeAmount] = useState<CurrencyAmount<Token>>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    // if there was a tx hash, we want to clear the input
    if (hash) {
      onPercentSelectForSlider(0)
    }
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onUnstake() {
    // if callback not returned properly ignore
    if (!freeStakeBalance) {
      return
    }

    // Switch to the target chain in the background; the wallet does not need to manually switch.
    const switched = await selectChain(unstakeChainId)
    if (!switched) {
      return
    }

    setAttempting(true)
    setStakeAmount(parsedAmount)

    // try delegation and store hash
    const txHash = await unstakeCallback(parsedAmount, isPool)?.catch((error) => {
      setAttempting(false)
      logger.info('UnstakeModal', 'onUnstake', error)
    })

    if (txHash) {
      setHash(txHash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={480}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <AutoColumn gap="lg" justify="center">
            <RowBetween>
              <ThemedText.DeprecatedMediumHeader fontWeight={500}>{title}</ThemedText.DeprecatedMediumHeader>
              <StyledClosed stroke="black" onClick={wrappedOnDismiss} />
            </RowBetween>
            <RowBetween>
              {isPool ? <Trans>Unstaking smart pool free stake.</Trans> : <Trans>Unstaking your free stake.</Trans>}
            </RowBetween>
            {chains.length > 1 && (
              <Flex row flexWrap="wrap" gap="$spacing8" width="100%">
                {chains.map((chain) => {
                  const info = getChainInfo(chain.chainId)
                  const active = chain.chainId === selectedChainId
                  return (
                    <ChainPill
                      key={chain.chainId}
                      size="small"
                      variant="branded"
                      emphasis="secondary"
                      fill={false}
                      data-active={active}
                      onPress={() => setSelectedChainId(chain.chainId)}
                    >
                      <Text fontSize={14} fontWeight="600">
                        {info.label}
                      </Text>
                      <Text fontSize={12} color="$neutral2">
                        {formatCurrencyAmount({ value: chain.freeStakeBalance })} GRG
                      </Text>
                    </ChainPill>
                  )
                })}
              </Flex>
            )}
            {chains.length === 1 && (
              <Flex row alignItems="center" gap="$spacing8">
                <ThemedText.DeprecatedBody fontSize={14} color="neutral2">
                  {chainInfo.label}
                </ThemedText.DeprecatedBody>
              </Flex>
            )}
            <RowBetween>
              <ResponsiveHeaderText>{percentForSlider}%</ResponsiveHeaderText>
              <Flex row gap="$gap8" width="100%" justifyContent="center">
                {[25, 50, 75, 100].map((option) => {
                  const active = percent === option.toString()
                  const disabled = false
                  return (
                    <ClickablePill
                      key={option}
                      onPress={() => {
                        onPercentSelectForSlider(option)
                      }}
                      $disabled={disabled}
                      $active={active}
                      customBorderColor={colors.surface3.val}
                      foregroundColor={colors[active ? 'neutral1' : 'neutral2'].val}
                      label={option < 100 ? option + '%' : t('swap.button.max')}
                      px="$spacing16"
                      textVariant="buttonLabel2"
                    />
                  )
                })}
              </Flex>
            </RowBetween>
            <Slider value={percentForSlider} onChange={onPercentSelectForSlider} />
            <LightCard>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                    <Trans
                      i18nKey="earn.unstake.withdrawing"
                      values={{ amount: formatCurrencyAmount({ value: parsedAmount }) }}
                      defaults="Withdrawing {{amount}} GRG"
                    />
                  </ThemedText.DeprecatedBody>
                </RowBetween>
              </AutoColumn>
            </LightCard>
            <ButtonPrimary disabled={formatCurrencyAmount({ value: parsedAmount }) === '0'} onClick={onUnstake}>
              <ThemedText.DeprecatedMediumHeader color="white">
                <Trans>Unstake</Trans>{' '}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Withdrawing Stake</Trans>
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>
              {formatCurrencyAmount({ value: parsedAmount })} GRG
            </ThemedText.DeprecatedMain>
          </AutoColumn>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          <AutoColumn gap="12px" justify="center">
            {!confirmed ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Submitted</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedMain fontSize={36}>
                  Unstaking {formatCurrencyAmount({ value: stakeAmount })} GRG
                </ThemedText.DeprecatedMain>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedMain fontSize={36}>
                  Unstaked {formatCurrencyAmount({ value: stakeAmount })} GRG
                </ThemedText.DeprecatedMain>
              </>
            ) : (
              <ThemedText.DeprecatedLargeHeader>
                <Trans>Transaction Failed</Trans>
              </ThemedText.DeprecatedLargeHeader>
            )}
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { X } from 'react-feather'
import { Trans } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { ButtonPrimary } from '~/components/Button/buttons'
import { LightCard } from '~/components/Card/cards'
import { AutoColumn } from '~/components/deprecated/Column'
import { RowBetween } from '~/components/deprecated/Row'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { useAccount } from '~/hooks/useAccount'
import useSelectChain from '~/hooks/useSelectChain'
import styled from '~/lib/deprecated-styled'
import { useHarvestCallback } from '~/state/stake/hooks'
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

export interface HarvestChainOption {
  chainId: number
  yieldAmount: CurrencyAmount<Token>
  poolIds: string[]
}

interface HarvestYieldModalProps {
  isOpen: boolean
  isPool?: boolean
  poolAddress?: string
  chains: HarvestChainOption[]
  onDismiss: () => void
  title: ReactNode
}

export default function HarvestYieldModal({
  isOpen,
  isPool,
  poolAddress,
  chains,
  onDismiss,
  title,
}: HarvestYieldModalProps) {
  const account = useAccount()
  const selectChain = useSelectChain()
  const { formatCurrencyAmount } = useLocalizationContext()

  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(undefined)

  // Reset and default the selected chain when the modal opens / options change.
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

  const harvestChainId = selectedChain?.chainId ?? account.chainId ?? UniverseChainId.Mainnet
  const chainInfo = getChainInfo(harvestChainId)
  const harvestCallback = useHarvestCallback({ chainId: harvestChainId, poolAddress, isPool })

  const yieldAmount = selectedChain?.yieldAmount
  const poolIds = selectedChain?.poolIds

  // monitor call to help UI loading state
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const [farmAmount, setFarmAmount] = useState<CurrencyAmount<Token>>()

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }

  async function onHarvest() {
    if (!poolIds || poolIds.length === 0) {
      return
    }

    // Switch to the target chain in the background; the wallet does not need to manually switch.
    const switched = await selectChain(harvestChainId)
    if (!switched) {
      return
    }

    setAttempting(true)
    setFarmAmount(yieldAmount)

    const txHash = await harvestCallback(poolIds)?.catch((error) => {
      setAttempting(false)
      logger.info('HarvestModal', 'onHarvest', error)
    })

    if (txHash) {
      setHash(txHash)
    }
  }

  const canHarvest = yieldAmount && formatCurrencyAmount({ value: yieldAmount }) !== '0'

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
              {isPool ? (
                <Trans>Harvesting your pool&apos;s staker yield.</Trans>
              ) : (
                <Trans>Harvesting your staker yield.</Trans>
              )}
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
                        {formatCurrencyAmount({ value: chain.yieldAmount })} GRG
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
            <LightCard>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedBody fontSize={16} fontWeight={500}>
                    <Trans
                      i18nKey="earn.harvest.harvesting"
                      values={{ amount: formatCurrencyAmount({ value: yieldAmount }) }}
                      defaults="Harvesting {{amount}} GRG"
                    />
                  </ThemedText.DeprecatedBody>
                </RowBetween>
              </AutoColumn>
            </LightCard>
            <ButtonPrimary disabled={!canHarvest} onClick={onHarvest}>
              <ThemedText.DeprecatedMediumHeader color="white">
                <Trans>Harvest</Trans>{' '}
              </ThemedText.DeprecatedMediumHeader>
            </ButtonPrimary>
          </AutoColumn>
        </ContentWrapper>
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify="center">
            <ThemedText.DeprecatedLargeHeader>
              <Trans>Harvesting Yield</Trans>
            </ThemedText.DeprecatedLargeHeader>
            <ThemedText.DeprecatedMain fontSize={36}>
              {formatCurrencyAmount({ value: yieldAmount })}
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
                  Claiming {formatCurrencyAmount({ value: farmAmount })} GRG
                </ThemedText.DeprecatedMain>
              </>
            ) : transactionSuccess ? (
              <>
                <ThemedText.DeprecatedLargeHeader>
                  <Trans>Transaction Success</Trans>
                </ThemedText.DeprecatedLargeHeader>
                <ThemedText.DeprecatedMain fontSize={36}>
                  Claimed {formatCurrencyAmount({ value: farmAmount })} GRG
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

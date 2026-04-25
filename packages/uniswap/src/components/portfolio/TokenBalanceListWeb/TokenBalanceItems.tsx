import { SharedEventName } from '@uniswap/analytics-events'
import { Currency } from '@uniswap/sdk-core'
import { memo, useCallback, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Flex, Loader } from 'ui/src'
import { ContextMenuTriggerMode } from 'uniswap/src/components/menus/types'
import { HiddenTokensRow } from 'uniswap/src/components/portfolio/HiddenTokensRow'
import { TokenBalanceItem } from 'uniswap/src/components/portfolio/TokenBalanceItem/TokenBalanceItem'
import { TokenBalanceItemContextMenu } from 'uniswap/src/components/portfolio/TokenBalanceItem/TokenBalanceItemContextMenu'
import { ChainBalanceRow } from 'uniswap/src/components/portfolio/TokenBalanceListWeb/ChainBalanceRow'
import { PortfolioBalance, PortfolioChainBalance, PortfolioMultichainBalance } from 'uniswap/src/features/dataApi/types'
import { pushNotification } from 'uniswap/src/features/notifications/slice/slice'
import { AppNotificationType, CopyNotificationType } from 'uniswap/src/features/notifications/slice/types'
import { useTokenBalanceListContext } from 'uniswap/src/features/portfolio/TokenBalanceListContext'
import {
  isChainRowId,
  isHiddenTokenBalancesRow,
  parseChainRowId,
  TokenBalanceListRow,
} from 'uniswap/src/features/portfolio/types'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { HiddenTokenInfoModal } from 'uniswap/src/features/transactions/modals/HiddenTokenInfoModal'
import { setClipboard } from 'utilities/src/clipboard/clipboard'
import { isExtensionApp } from 'utilities/src/platform'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'

function multichainToPortfolioBalanceForMenu(
  multichain: PortfolioMultichainBalance,
  chainToken: PortfolioChainBalance,
): PortfolioBalance {
  return {
    id: multichain.id,
    cacheId: `${multichain.cacheId}-${chainToken.chainId}`,
    quantity: chainToken.quantity,
    balanceUSD: chainToken.valueUsd,
    currencyInfo: chainToken.currencyInfo,
    relativeChange24: multichain.pricePercentChange1d,
    isHidden: multichain.isHidden,
  }
}

export const TokenBalanceItems = ({
  animated,
  rows,
  openReportTokenModal,
  hiddenTokensRowRef,
}: {
  animated?: boolean
  rows: string[]
  openReportTokenModal: (currency: Currency, isMarkedSpam: Maybe<boolean>) => void
  hiddenTokensRowRef?: React.RefObject<HTMLDivElement | null>
}): JSX.Element => {
  return (
    <Flex
      {...(animated && {
        animation: 'quicker',
        enterStyle: { opacity: 0, y: -10 },
        exitStyle: { opacity: 0, y: -10 },
      })}
    >
      {rows.map((balance: TokenBalanceListRow) => {
        return (
          <TokenBalanceItemRow
            key={balance}
            item={balance}
            openReportTokenModal={openReportTokenModal}
            hiddenTokensRowRef={hiddenTokensRowRef}
          />
        )
      })}
    </Flex>
  )
}

const TokenBalanceItemRow = memo(function TokenBalanceItemRow({
  item,
  openReportTokenModal,
  hiddenTokensRowRef,
}: {
  item: TokenBalanceListRow
  openReportTokenModal: (currency: Currency, isMarkedSpam: Maybe<boolean>) => void
  hiddenTokensRowRef?: React.RefObject<HTMLDivElement | null>
}) {
  const { balancesById, expandedCurrencyIds, isWarmLoading, toggleExpanded, multichainRowExpansionEnabled } =
    useTokenBalanceListContext()
  const trace = useTrace()
  const dispatch = useDispatch()

  const [isModalVisible, setModalVisible] = useState(false)

  const openModal = useCallback((): void => {
    setModalVisible(true)
  }, [])

  const closeModal = useCallback((): void => {
    setModalVisible(false)
  }, [])

  const { parentBalance, isChildRow, chainToken } = useMemo(() => {
    if (isChainRowId(item)) {
      const { currencyId: cid, chainId } = parseChainRowId(item)
      const balance = balancesById?.[cid]
      const chain = balance?.tokens.find((t) => t.chainId === chainId)
      return {
        parentBalance: balance,
        isChildRow: true,
        chainToken: chain,
      }
    }
    return {
      parentBalance: balancesById?.[item],
      isChildRow: false,
      chainToken: undefined,
    }
  }, [balancesById, item])

  const toggleMultichainRow = useCallback(() => {
    if (!parentBalance) {
      return
    }
    const nextExpanded = !expandedCurrencyIds.has(parentBalance.id)
    toggleExpanded(parentBalance.id)
    if (isExtensionApp && multichainRowExpansionEnabled) {
      sendAnalyticsEvent(SharedEventName.ELEMENT_CLICKED, {
        ...trace,
        element: ElementName.BreakdownExpanded,
        multichainTokenRowState: nextExpanded ? 'open' : 'close',
      })
    }
  }, [expandedCurrencyIds, multichainRowExpansionEnabled, parentBalance, toggleExpanded, trace])

  const copyAddressToClipboard = useCallback(
    async (address: string): Promise<void> => {
      await setClipboard(address)
      dispatch(
        pushNotification({
          type: AppNotificationType.Copied,
          copyType: CopyNotificationType.ContractAddress,
        }),
      )
    },
    [dispatch],
  )

  // Adapter to bridge multichain balance to PortfolioBalance shape for the context menu.
  // Only used with single-chain tokens (tokens.length === 1).
  const portfolioBalance: PortfolioBalance | undefined = useMemo(() => {
    if (!parentBalance?.tokens[0]) {
      return undefined
    }
    const primaryToken = parentBalance.tokens[0]
    return {
      id: parentBalance.id,
      cacheId: parentBalance.cacheId,
      quantity: primaryToken.quantity,
      balanceUSD: parentBalance.totalValueUsd,
      currencyInfo: primaryToken.currencyInfo,
      relativeChange24: parentBalance.pricePercentChange1d,
      isHidden: primaryToken.isHidden,
    }
  }, [parentBalance])

  const parentCurrencyInfo = parentBalance?.tokens[0]?.currencyInfo

  if (isHiddenTokenBalancesRow(item)) {
    return (
      <>
        <Flex ref={hiddenTokensRowRef}>
          <HiddenTokensRow onPressLearnMore={openModal} />
        </Flex>
        <HiddenTokenInfoModal isOpen={isModalVisible} onClose={closeModal} />
      </>
    )
  }

  if (isChildRow) {
    if (!chainToken || !parentBalance) {
      return (
        <Flex px="$spacing8">
          <Loader.Token />
        </Flex>
      )
    }
    const portfolioBalanceForMenu = multichainToPortfolioBalanceForMenu(parentBalance, chainToken)
    return (
      <TokenBalanceItemContextMenu
        portfolioBalance={portfolioBalanceForMenu}
        copyAddressToClipboard={copyAddressToClipboard}
        openReportTokenModal={() =>
          openReportTokenModal(
            portfolioBalanceForMenu.currencyInfo.currency,
            portfolioBalanceForMenu.currencyInfo.isSpam,
          )
        }
      >
        <ChainBalanceRow
          chainId={chainToken.chainId}
          symbol={chainToken.currencyInfo.currency.symbol}
          quantity={chainToken.quantity}
          valueUsd={chainToken.valueUsd ?? undefined}
        />
      </TokenBalanceItemContextMenu>
    )
  }

  if (!parentBalance || !portfolioBalance || !parentCurrencyInfo) {
    return (
      <Flex px="$spacing8">
        <Loader.Token />
      </Flex>
    )
  }

  const expandOnPrimaryClick = multichainRowExpansionEnabled && parentBalance.tokens.length > 1

  const tokenBalanceItem = (
    <TokenBalanceItem
      isHidden={parentBalance.isHidden ?? false}
      isLoading={isWarmLoading}
      currencyInfo={parentCurrencyInfo}
      portfolioBalance={parentBalance}
    />
  )

  if (expandOnPrimaryClick) {
    return (
      <TokenBalanceItemContextMenu
        portfolioBalance={portfolioBalance}
        copyAddressToClipboard={copyAddressToClipboard}
        openReportTokenModal={() =>
          openReportTokenModal(portfolioBalance.currencyInfo.currency, portfolioBalance.currencyInfo.isSpam)
        }
        triggerMode={ContextMenuTriggerMode.Secondary}
        onPressToken={toggleMultichainRow}
      >
        {tokenBalanceItem}
      </TokenBalanceItemContextMenu>
    )
  }

  return (
    <TokenBalanceItemContextMenu
      portfolioBalance={portfolioBalance}
      copyAddressToClipboard={copyAddressToClipboard}
      openReportTokenModal={() =>
        openReportTokenModal(portfolioBalance.currencyInfo.currency, portfolioBalance.currencyInfo.isSpam)
      }
    >
      {tokenBalanceItem}
    </TokenBalanceItemContextMenu>
  )
})

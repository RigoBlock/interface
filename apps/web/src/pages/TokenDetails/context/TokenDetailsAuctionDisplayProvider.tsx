import { onlineManager } from '@tanstack/react-query'
import { isEVMChain, normalizeTokenAddressForCache } from '@universe/chains'
import { createContext, type ReactNode, useMemo, useState, useSyncExternalStore } from 'react'
import { useAuctionDisplayDataSources } from '~/features/Toucan/Auction/hooks/useAuctionDisplayDataSources'
import { TokenDetailsSourceState } from '~/pages/TokenDetails/context/tokenDetailsSourceState'
import { useTDPStore } from '~/pages/TokenDetails/context/useTDPStore'
import type { TokenDetailsAuctionDisplayModel } from '~/pages/TokenDetails/hooks/useTokenDetailsAuctionDisplay'
import { resolveTokenDetailsAuctionDisplay } from '~/pages/TokenDetails/utils/tokenDetailsAuctionDisplay'
import {
  type InitialAuctionLoading,
  resolveInitialAuctionLoading,
} from '~/pages/TokenDetails/utils/tokenDetailsAuctionLoading'

export const TokenDetailsAuctionDisplayContext = createContext<TokenDetailsAuctionDisplayModel | null>(null)

const subscribeToOnlineStatus = (onChange: () => void): (() => void) => onlineManager.subscribe(onChange)
const getOnlineStatus = (): boolean => onlineManager.isOnline()

export function TokenDetailsAuctionDisplayProvider({ children }: { children: ReactNode }): JSX.Element {
  const { auctionSource, currencyChainId, address, currency, pageQueryLoading } = useTDPStore((state) => ({
    auctionSource: state.auctionSource,
    currencyChainId: state.currencyChainId,
    address: state.address,
    currency: state.currency,
    pageQueryLoading: state.pageQueryLoading,
  }))
  const pageKey = `${currencyChainId}:${normalizeTokenAddressForCache(address)}`
  const isPageReady = !pageQueryLoading && Boolean(currency)
  const chainId = isEVMChain(currencyChainId) ? currencyChainId : undefined
  const auction =
    auctionSource.status === TokenDetailsSourceState.Found && chainId !== undefined ? auctionSource.auction : undefined
  const { currentBlock, currencyRaised, pools, refetchCurrentBlock } = useAuctionDisplayDataSources({
    chainId,
    tokenAddress: auction?.tokenAddress,
    auctionAddress: auction?.address,
    startBlock: auction?.startBlock,
    endBlock: auction?.endBlock,
    enabled: auction !== undefined,
  })
  const display = useMemo(
    () => resolveTokenDetailsAuctionDisplay({ auction, chainId, currentBlock, currencyRaised, pools }),
    [auction, chainId, currentBlock, currencyRaised, pools],
  )
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getOnlineStatus)
  const [initialLoading, setInitialLoading] = useState<InitialAuctionLoading>({ pageKey, pending: undefined })
  const nextInitialLoading = resolveInitialAuctionLoading({
    previous: initialLoading,
    pageKey,
    isPageReady,
    isOnline,
    display,
  })
  if (nextInitialLoading !== initialLoading) {
    setInitialLoading(nextInitialLoading)
  }

  const isInitialLoading = nextInitialLoading.pending === true && isOnline
  const value = useMemo(
    () => ({ ...display, refetchCurrentBlock, isInitialLoading }),
    [display, refetchCurrentBlock, isInitialLoading],
  )

  return (
    <TokenDetailsAuctionDisplayContext.Provider value={value}>{children}</TokenDetailsAuctionDisplayContext.Provider>
  )
}

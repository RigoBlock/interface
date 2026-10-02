import { act, render } from '@testing-library/react'
import { useContext } from 'react'
import { MemoryRouter, NavigateFunction, Route, Routes, useNavigate } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuctionStoreContext } from '~/features/Toucan/Auction/store/AuctionStoreContext'
import { AuctionStoreProvider } from '~/features/Toucan/Auction/store/AuctionStoreContextProvider'
import type { AuctionStore } from '~/features/Toucan/Auction/store/createAuctionStore'
import type { AuctionDetails } from '~/features/Toucan/Auction/store/types'

// The provider's inner component wires up data loading + polling — irrelevant to
// store lifecycle, so stub them all out.
vi.mock('~/features/Toucan/Auction/hooks/useLoadAuctionDetails', () => ({ useLoadAuctionDetails: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useLoadCheckpointData', () => ({ useLoadCheckpointData: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useLoadUserBids', () => ({ useLoadUserBids: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useLoadBidDistributionData', () => ({ useLoadBidDistributionData: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useLoadTickDetails', () => ({ useLoadTickDetails: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useComputeConcentrationBand', () => ({
  useComputeConcentrationBand: vi.fn(),
}))
vi.mock('~/features/Toucan/Auction/hooks/useUpdateTokenColor', () => ({ useUpdateTokenColor: vi.fn() }))
vi.mock('~/features/Toucan/Auction/hooks/useAuctionBlockPolling', () => ({ useAuctionBlockPolling: vi.fn() }))

const AUCTION_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CANONICAL_A = '0x1111111111111111111111111111111111111111'
const AUCTION_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

let capturedStore: AuctionStore | null = null
let navigate: NavigateFunction

function Probe() {
  capturedStore = useContext(AuctionStoreContext)
  navigate = useNavigate()
  return null
}

function renderAtAuction(address: string) {
  return render(
    <MemoryRouter initialEntries={[`/explore/auctions/ethereum/${address}`]}>
      <Routes>
        <Route
          path="/explore/auctions/:chainName/:auctionAddress"
          element={
            <AuctionStoreProvider>
              <Probe />
            </AuctionStoreProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuctionStoreProvider', () => {
  it('initializes the store from the URL params', () => {
    renderAtAuction(AUCTION_A)

    expect(capturedStore?.getState().auctionAddress).toBe(AUCTION_A)
  })

  it('recreates the store when the route changes to a different auction', () => {
    renderAtAuction(AUCTION_A)
    const storeA = capturedStore
    expect(storeA).not.toBeNull()

    // Simulate GetAuction canonicalizing A's address so we can prove the
    // retained resolved address does not leak into auction B's store
    act(() => {
      storeA?.getState().actions.setAuctionDetails({ address: CANONICAL_A } as AuctionDetails)
    })
    expect(storeA?.getState().auctionAddress).toBe(CANONICAL_A)

    act(() => {
      navigate(`/explore/auctions/ethereum/${AUCTION_B}`)
    })

    expect(capturedStore).not.toBe(storeA)
    expect(capturedStore?.getState().auctionAddress).toBe(AUCTION_B)
  })

  it('keeps the same store instance when re-navigating to the same auction', () => {
    renderAtAuction(AUCTION_A)
    const storeA = capturedStore

    act(() => {
      navigate(`/explore/auctions/ethereum/${AUCTION_A}`)
    })

    expect(capturedStore).toBe(storeA)
  })
})

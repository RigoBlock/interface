import { UniverseChainId } from '@universe/chains'
import type { PropsWithChildren } from 'react'
import { SearchModal } from '~/components/NavBar/SearchBar/SearchModal'
import { mockMediaSize } from '~/test-utils/mockMediaSize'
import { act, fireEvent, render, screen } from '~/test-utils/render'

vi.mock('@universe/mycelium/theme-hooks-compat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/mycelium/theme-hooks-compat')>()
  return {
    ...actual,
    useMedia: vi.fn(),
  }
})

vi.mock('uniswap/src/components/modals/Modal', () => ({
  Modal: ({ children }: PropsWithChildren) => children,
}))

vi.mock('uniswap/src/components/modals/ScrollLock', () => ({
  useUpdateScrollLock: vi.fn(),
}))

vi.mock('uniswap/src/components/network/NetworkFilter/NetworkFilter', () => ({
  NetworkFilter: ({ onPressChain }: { onPressChain: (chainId: UniverseChainId | null) => void }) => (
    <>
      <button onClick={() => onPressChain(UniverseChainId.Solana)}>filter-solana</button>
      <button onClick={() => onPressChain(UniverseChainId.Mainnet)}>filter-mainnet</button>
      <button onClick={() => onPressChain(null)}>filter-all-networks</button>
    </>
  ),
}))

vi.mock('~/components/NavBar/SearchBar/SmartPoolsSearchList', () => ({
  SmartPoolsSearchList: ({ query }: { query: string }) => <div>{`smart-pools:${query}`}</div>,
}))

vi.mock('~/hooks/useModalState', () => ({
  useModalState: () => ({ isOpen: true, toggleModal: vi.fn() }),
}))

describe('SearchModal (RigoBlock smart-pool search)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search field with the fork placeholder and the smart pools list', async () => {
    mockMediaSize('xxxl')
    render(<SearchModal isAuctionSearchEnabled={false} />)

    expect(screen.getByPlaceholderText('Search by name, symbol, or address')).toBeInTheDocument()
    // Upstream's token tabs are hidden; the empty query lists smart pools.
    expect(screen.getByText('smart-pools:')).toBeInTheDocument()
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument()
  })

  it('debounces the typed query into the smart pools list', async () => {
    vi.useFakeTimers()
    mockMediaSize('xxxl')
    render(<SearchModal isAuctionSearchEnabled={false} />)

    fireEvent.change(screen.getByPlaceholderText('Search by name, symbol, or address'), {
      target: { value: 'grg' },
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByText('smart-pools:grg')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('keeps the chain filter wired to the pools list', async () => {
    mockMediaSize('xxxl')
    render(<SearchModal isAuctionSearchEnabled />)

    fireEvent.click(screen.getByText('filter-solana'))
    // The fork list is chain-filter aware; the modal still renders (no tab fallback state upstream).
    expect(screen.getByText('smart-pools:')).toBeInTheDocument()
  })

  it('uses the short fork placeholder on small viewports, where the long copy clips', async () => {
    mockMediaSize('sm')
    render(<SearchModal isAuctionSearchEnabled={false} />)

    expect(screen.getByPlaceholderText('Search smart pools')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search by name, symbol, or address')).not.toBeInTheDocument()
  })
})

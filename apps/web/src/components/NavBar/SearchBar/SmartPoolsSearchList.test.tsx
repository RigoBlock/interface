import { UniverseChainId } from '@universe/chains'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { SmartPoolsSearchList } from '~/components/NavBar/SearchBar/SmartPoolsSearchList'

const POOLS = [
  { group: undefined, pool: '0xEfa4bDf566aE50537A507863612638680420645C', name: 'Rigoblock Alpha', symbol: 'GRGA', id: '1', chainId: UniverseChainId.Mainnet },
  { group: undefined, pool: '0xca9f5049c1ea8fc78574f94b7cf5be5fee354c31', name: 'Rigoblock Beta', symbol: 'GRGB', id: '2', chainId: UniverseChainId.Base },
]

vi.mock('~/state/pool/multichain', () => ({
  useMultiChainAllPoolsData: vi.fn(() => ({ data: POOLS })),
}))

function wrapper({ children }: PropsWithChildren): JSX.Element {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SmartPoolsSearchList', () => {
  it('renders every smart pool (empty query), sorted by symbol', () => {
    render(<SmartPoolsSearchList chainFilter={null} query="" onSelect={vi.fn()} />, { wrapper })

    const symbols = screen.getAllByText(/GRG[AB]/).map((el) => el.textContent)
    expect(symbols).toEqual(['GRGA', 'GRGB'])
    expect(screen.getByText('Rigoblock Alpha')).toBeInTheDocument()
    expect(screen.getByText('Rigoblock Beta')).toBeInTheDocument()
  })

  it('filters client-side by symbol, name, or address', () => {
    render(<SmartPoolsSearchList chainFilter={null} query="beta" onSelect={vi.fn()} />, { wrapper })
    expect(screen.queryByText('Rigoblock Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Rigoblock Beta')).toBeInTheDocument()

    render(<SmartPoolsSearchList chainFilter={null} query="0xefa4" onSelect={vi.fn()} />, { wrapper })
    expect(screen.getByText('Rigoblock Alpha')).toBeInTheDocument()
  })

  it('applies the chain filter', () => {
    render(<SmartPoolsSearchList chainFilter={UniverseChainId.Base} query="" onSelect={vi.fn()} />, { wrapper })
    expect(screen.queryByText('Rigoblock Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Rigoblock Beta')).toBeInTheDocument()
  })

  it('shows the no-match state for a query without hits', () => {
    render(<SmartPoolsSearchList chainFilter={null} query="zzz" onSelect={vi.fn()} />, { wrapper })
    expect(screen.getByText('No smart pools match your search')).toBeInTheDocument()
  })

  it('navigates to the pool page and calls onSelect when a row is pressed', () => {
    const onSelect = vi.fn()
    render(<SmartPoolsSearchList chainFilter={null} query="" onSelect={onSelect} />, { wrapper })

    fireEvent.click(screen.getByText('GRGA'))
    expect(onSelect).toHaveBeenCalled()
  })
})

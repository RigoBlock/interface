import { render, screen } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HeightAnimator } from './HeightAnimator.native'

// Mycelium has no native-runtime test lane: like the sibling native splits
// (VirtualList.native.test.tsx, FloatingOverlay.native.test.tsx) this runs in
// the package's jsdom vitest with react-native stood in — the contract under
// test is the stub's own branching, not RN rendering.
vi.mock('react-native', () => ({
  StyleSheet: {
    create: <T,>(styles: T): T => styles,
  },
  View: ({ children, style, id }: { children?: ReactNode; style?: unknown; id?: string }): ReactElement => (
    <div data-testid="native-view" id={id} data-style={JSON.stringify(style)}>
      {children}
    </div>
  ),
}))

/** The stub passes `style={[container, open|closed]}` — flatten the recorded array for assertions. */
function containerStyle(): Record<string, unknown> {
  const raw = screen.getByTestId('native-view').dataset['style']
  if (!raw) {
    throw new Error('native View rendered without a style prop')
  }
  const parsed: unknown = JSON.parse(raw)
  const layers = Array.isArray(parsed) ? parsed : [parsed]
  return layers.reduce<Record<string, unknown>>((merged, layer) => {
    if (layer && typeof layer === 'object') {
      return { ...merged, ...(layer as Record<string, unknown>) }
    }
    return merged
  }, {})
}

describe('HeightAnimator (native stub)', () => {
  it('renders children at natural height when open (default), forwarding id like the web leg', () => {
    render(
      <HeightAnimator id="expando-section">
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(screen.queryByTestId('child')).not.toBeNull()
    expect(containerStyle()).toMatchObject({ height: 'auto', overflow: 'hidden', width: '100%' })
    expect(screen.getByTestId('native-view').id).toBe('expando-section')
  })

  it('collapses to height 0 instantly when closed, keeping children mounted by default', () => {
    render(
      <HeightAnimator open={false}>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(containerStyle()).toMatchObject({ height: 0 })
    expect(screen.queryByTestId('child')).not.toBeNull()
  })

  it('unmounts children immediately when collapsed with unmountChildrenWhenCollapsed (no web-style 550ms delay)', () => {
    const { rerender } = render(
      <HeightAnimator open unmountChildrenWhenCollapsed>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(screen.queryByTestId('child')).not.toBeNull()

    rerender(
      <HeightAnimator open={false} unmountChildrenWhenCollapsed>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    // Synchronous assertion right after the rerender: there is no animation
    // to wait for on native, so there must be no delayed-unmount timer.
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('remounts children on reopen after a lazy unmount', () => {
    const { rerender } = render(
      <HeightAnimator open={false} unmountChildrenWhenCollapsed>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(screen.queryByTestId('child')).toBeNull()

    rerender(
      <HeightAnimator open unmountChildrenWhenCollapsed>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(screen.queryByTestId('child')).not.toBeNull()
  })

  it('is exempted from lazy unmount by useInitialHeight (parity with the web leg)', () => {
    render(
      <HeightAnimator open={false} useInitialHeight unmountChildrenWhenCollapsed>
        <span data-testid="child">content</span>
      </HeightAnimator>,
    )
    expect(screen.queryByTestId('child')).not.toBeNull()
    expect(containerStyle()).toMatchObject({ height: 0 })
  })
})

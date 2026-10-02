import { fireEvent } from '@testing-library/react'
import { Flex } from '@universe/mycelium'
import type { FocusedRowControl } from 'uniswap/src/components/lists/items/OptionItem'
import { ExpandableSearchRow } from 'uniswap/src/features/expandableAsset/ExpandableSearchRow'
import { render } from 'uniswap/src/test/test-utils'

// Mycelium compiles the two highlight sources to distinct utility classes on the rendered header: a flat background
// class for the keyboard-nav path's `backgroundColor`, and a `hover:`-prefixed custom-property hook for `hoverStyle`.
const FOCUS_HIGHLIGHT = /(?:^|\s)bg-surface1-hovered(?:\s|$)/
const HOVER_HIGHLIGHT = /hover:bg-\[color:var\(--ch-bg\)\]/

const HEADER_TEST_ID = 'expandable-row-header'

function renderRow({ showShell, focusedRowControl }: { showShell: boolean; focusedRowControl?: FocusedRowControl }): {
  headerElement: HTMLElement
  unmount: () => void
} {
  const { getByTestId, unmount } = render(
    <ExpandableSearchRow
      showShell={showShell}
      canExpand={true}
      isExpanded={showShell}
      onToggle={vi.fn()}
      header={<Flex testID={HEADER_TEST_ID} />}
      panelSlot={showShell ? <Flex testID="panel" /> : null}
      focusedRowControl={focusedRowControl}
      testID="row"
    />,
  )
  // The header node is the consumer's own element; its parent is the styled Flex that carries the highlight.
  // This env renders mycelium to the DOM, but the RN-testing-library types still describe a ReactTestInstance.
  const headerElement = (getByTestId(HEADER_TEST_ID) as unknown as HTMLElement).parentElement
  if (!headerElement) {
    throw new Error('expected the header to be wrapped by the row header Flex')
  }
  return { headerElement, unmount }
}

function headerClassName(args: { showShell: boolean; focusedRowControl?: FocusedRowControl }): string {
  const { headerElement, unmount } = renderRow(args)
  const className = headerElement.className
  unmount()
  return className
}

describe('ExpandableSearchRow header highlight', () => {
  it('highlights the focused collapsed row but not the expanded header (keyboard-nav path)', () => {
    const focusedRowControl = { rowIndex: 0, focusedRowIndex: 0, setFocusedRowIndex: vi.fn() }

    expect(headerClassName({ showShell: false, focusedRowControl })).toMatch(FOCUS_HIGHLIGHT)
    expect(headerClassName({ showShell: true, focusedRowControl })).not.toMatch(FOCUS_HIGHLIGHT)
  })

  it('hovers the collapsed row but not the expanded header (no focusedRowControl → hoverStyle path)', () => {
    expect(headerClassName({ showShell: false })).toMatch(HOVER_HIGHLIGHT)
    expect(headerClassName({ showShell: true })).not.toMatch(HOVER_HIGHLIGHT)
  })

  it('keeps the expanded header driving the list focus index, so arrow-key focus does not drift under the cursor', () => {
    const setFocusedRowIndex = vi.fn()
    const { headerElement } = renderRow({
      showShell: true,
      focusedRowControl: { rowIndex: 3, focusedRowIndex: undefined, setFocusedRowIndex },
    })

    fireEvent.mouseOver(headerElement)
    expect(setFocusedRowIndex).toHaveBeenLastCalledWith(3)
    fireEvent.mouseOut(headerElement)
    expect(setFocusedRowIndex).toHaveBeenLastCalledWith(undefined)
  })
})

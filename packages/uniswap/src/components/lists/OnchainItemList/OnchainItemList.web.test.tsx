import { OnchainItemListOption } from 'uniswap/src/components/lists/items/types'
import {
  findFocusableRowIndex,
  getFirstFocusableRowIndex,
  type OnchainItemListData,
} from 'uniswap/src/components/lists/OnchainItemList/rowInfo'

// Only the discriminating shape matters here: headers lack `renderItem`, horizontal rows carry an array `item`.
function header(): OnchainItemListData<OnchainItemListOption> {
  return {
    key: 'header',
    measurementKey: 'section-header',
    section: { sectionKey: 'header' },
  } as unknown as OnchainItemListData<OnchainItemListOption>
}

function row(item: unknown): OnchainItemListData<OnchainItemListOption> {
  return {
    key: 'row',
    measurementKey: 'item-row',
    item,
    renderItem: () => null,
  } as unknown as OnchainItemListData<OnchainItemListOption>
}

describe('getFirstFocusableRowIndex', () => {
  it('returns undefined for an empty list', () => {
    expect(getFirstFocusableRowIndex([])).toBeUndefined()
  })

  it('skips a leading section header', () => {
    expect(getFirstFocusableRowIndex([header(), row({ type: 'token' })])).toBe(1)
  })

  it('returns 0 when the first row is a plain item', () => {
    expect(getFirstFocusableRowIndex([row({ type: 'token' }), header(), row({ type: 'pool' })])).toBe(0)
  })

  it('skips horizontal rows (recent-search pills) and their header', () => {
    expect(getFirstFocusableRowIndex([header(), row([{ type: 'token' }]), header(), row({ type: 'token' })])).toBe(3)
  })

  it('returns undefined when only headers and horizontal rows are present', () => {
    expect(getFirstFocusableRowIndex([header(), row([{ type: 'token' }])])).toBeUndefined()
  })
})

describe('findFocusableRowIndex', () => {
  const items = [header(), row([{ type: 'token' }]), header(), row({ type: 'token' }), header(), row({ type: 'pool' })]

  it('steps down over a header to the next item row', () => {
    expect(findFocusableRowIndex({ items, from: 4, direction: 1 })).toBe(5)
  })

  it('steps up over a header and a horizontal pill row', () => {
    expect(findFocusableRowIndex({ items, from: 2, direction: -1 })).toBeUndefined()
    expect(findFocusableRowIndex({ items, from: 4, direction: -1 })).toBe(3)
  })

  it('returns undefined past either end', () => {
    expect(findFocusableRowIndex({ items, from: 6, direction: 1 })).toBeUndefined()
    expect(findFocusableRowIndex({ items, from: -1, direction: -1 })).toBeUndefined()
  })
})

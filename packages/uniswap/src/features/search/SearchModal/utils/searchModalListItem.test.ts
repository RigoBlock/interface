import { UniverseChainId } from '@universe/chains'
import { OnchainItemListOptionType, type MultichainTokenOption } from 'uniswap/src/components/lists/items/types'
import type { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import {
  RECENT_SEARCH_PILL_ROW_KEY,
  searchModalListOptionKey,
  searchModalOptionKey,
} from 'uniswap/src/features/search/SearchModal/utils/searchModalListItem'

function createMultichainOption({
  id,
  chainId,
  currencyId,
  tdpChainFilter,
}: {
  id: string
  chainId: UniverseChainId
  currencyId: string
  tdpChainFilter?: UniverseChainId
}): MultichainTokenOption {
  const primaryCurrencyInfo = {
    currency: { chainId },
    currencyId,
  } as CurrencyInfo

  return {
    type: OnchainItemListOptionType.MultichainToken,
    multichainResult: {
      id,
      name: 'Test token',
      symbol: 'TEST',
      logoUrl: null,
      tokens: [primaryCurrencyInfo],
    },
    primaryCurrencyInfo,
    tdpChainFilter,
  }
}

describe('searchModalOptionKey', () => {
  it('preserves a nonempty multichain ID', () => {
    const option = createMultichainOption({
      id: 'multichain-id',
      chainId: UniverseChainId.Mainnet,
      currencyId: '1-0xabc',
    })

    expect(searchModalOptionKey(option)).toBe('multichain-multichain-id')
  })

  it('uses distinct primary deployment keys for empty multichain IDs', () => {
    const first = createMultichainOption({
      id: '',
      chainId: UniverseChainId.Mainnet,
      currencyId: '1-0xabc',
    })
    const second = createMultichainOption({
      id: '   ',
      chainId: UniverseChainId.ArbitrumOne,
      currencyId: '42161-0xdef',
    })

    expect(searchModalOptionKey(first)).toBe('multichain-fallback-1-1-0xabc')
    expect(searchModalOptionKey(second)).toBe('multichain-fallback-42161-42161-0xdef')
    expect(searchModalOptionKey(first)).not.toBe(searchModalOptionKey(second))
  })

  it('distinguishes the same multichain token recorded with and without a TDP chain filter', () => {
    const unfiltered = createMultichainOption({
      id: 'multichain-id',
      chainId: UniverseChainId.Mainnet,
      currencyId: '1-0xabc',
    })
    const filtered = createMultichainOption({
      id: 'multichain-id',
      chainId: UniverseChainId.Mainnet,
      currencyId: '1-0xabc',
      tdpChainFilter: UniverseChainId.ArbitrumOne,
    })

    expect(searchModalOptionKey(filtered)).toBe(`multichain-multichain-id-${UniverseChainId.ArbitrumOne}`)
    expect(searchModalOptionKey(filtered)).not.toBe(searchModalOptionKey(unfiltered))
  })
})

describe('searchModalListOptionKey', () => {
  it('keys a pill row on a stable key regardless of its members', () => {
    const first = createMultichainOption({ id: 'a', chainId: UniverseChainId.Mainnet, currencyId: '1-0xa' })
    const second = createMultichainOption({ id: 'b', chainId: UniverseChainId.Mainnet, currencyId: '1-0xb' })

    expect(searchModalListOptionKey([first])).toBe(RECENT_SEARCH_PILL_ROW_KEY)
    expect(searchModalListOptionKey([second, first])).toBe(RECENT_SEARCH_PILL_ROW_KEY)
  })

  it('keys a single option on its option key', () => {
    const option = createMultichainOption({ id: 'a', chainId: UniverseChainId.Mainnet, currencyId: '1-0xa' })
    expect(searchModalListOptionKey(option)).toBe(searchModalOptionKey(option))
  })
})

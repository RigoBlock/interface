import { useDispatch } from 'react-redux'
import {
  MultichainTokenOption,
  OnchainItemListOptionType,
  PoolOption,
  SearchModalOption,
} from 'uniswap/src/components/lists/items/types'
import { getNativeAddress } from 'uniswap/src/constants/addresses'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import {
  MultichainTokenSearchHistoryResult,
  PoolSearchHistoryResult,
  SearchHistoryResultType,
  TokenSearchHistoryResult,
} from 'uniswap/src/features/search/SearchHistoryResult'
import { addToSearchHistory } from 'uniswap/src/features/search/searchHistorySlice'
import { tokenAddressOrNativeAddress } from 'uniswap/src/features/search/utils'

export function useAddToSearchHistory(): {
  registerSearchItem: (item: SearchModalOption) => void
  registerSearchTokenCurrencyInfo: (currencyInfo: CurrencyInfo) => void
} {
  const dispatch = useDispatch()

  const registerSearchItem = (item: SearchModalOption): void => {
    switch (item.type) {
      case OnchainItemListOptionType.Pool:
        dispatch(addToSearchHistory({ searchResult: poolOptionToSearchHistoryResult(item) }))
        break
      case OnchainItemListOptionType.Token:
        dispatch(addToSearchHistory({ searchResult: currencyInfoToTokenSearchHistoryResult(item.currencyInfo) }))
        break
      case OnchainItemListOptionType.MultichainToken:
        dispatch(addToSearchHistory({ searchResult: multichainTokenOptionToSearchHistoryResult(item) }))
        break
      case OnchainItemListOptionType.WalletByAddress:
      case OnchainItemListOptionType.Unitag:
      case OnchainItemListOptionType.ENSAddress:
        dispatch(
          addToSearchHistory({
            // ensName, unitag, primaryENSName, etc are dynamic and should be re-fetched at calltime
            // so we add to search history as a simple `WalletByAddress` type and do the refetching inside WalletByAddressOptionItem
            searchResult: { address: item.address, type: SearchHistoryResultType.WalletByAddress },
          }),
        )
        break
    }
  }

  const registerSearchTokenCurrencyInfo = (currencyInfo: CurrencyInfo): void => {
    dispatch(addToSearchHistory({ searchResult: currencyInfoToTokenSearchHistoryResult(currencyInfo) }))
  }

  return { registerSearchItem, registerSearchTokenCurrencyInfo }
}

function poolOptionToSearchHistoryResult(item: PoolOption): PoolSearchHistoryResult {
  const { chainId, poolId, token0CurrencyInfo, token1CurrencyInfo, protocolVersion, feeTier } = item
  return {
    type: SearchHistoryResultType.Pool,
    chainId,
    poolId,
    token0CurrencyId: token0CurrencyInfo.currencyId,
    token1CurrencyId: token1CurrencyInfo.currencyId,
    protocolVersion,
    feeTier,
  }
}

function multichainTokenOptionToSearchHistoryResult(item: MultichainTokenOption): MultichainTokenSearchHistoryResult {
  const { multichainResult } = item
  return {
    type: SearchHistoryResultType.MultichainToken,
    multichainId: multichainResult.id,
    name: multichainResult.name,
    symbol: multichainResult.symbol,
    logoUrl: multichainResult.logoUrl ?? undefined,
    tokenCurrencyIds: multichainResult.tokens.map((t) => t.currencyId),
  }
}

function currencyInfoToTokenSearchHistoryResult(currencyInfo: CurrencyInfo): TokenSearchHistoryResult {
  const address = currencyInfo.currency.isToken
    ? currencyInfo.currency.address
    : getNativeAddress(currencyInfo.currency.chainId)

  return {
    type: SearchHistoryResultType.Token,
    chainId: currencyInfo.currency.chainId,
    address: tokenAddressOrNativeAddress(address, currencyInfo.currency.chainId),
  }
}

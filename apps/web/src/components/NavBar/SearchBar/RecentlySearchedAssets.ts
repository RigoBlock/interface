import { NATIVE_CHAIN_ID } from 'constants/tokens'
import { GqlSearchToken } from 'graphql/data/SearchTokens'
import { GenieCollection } from 'nft/types'
import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { MAX_RECENT_SEARCH_RESULTS } from 'uniswap/src/components/TokenSelector/constants'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import {
  Chain,
  useRecentlySearchedAssetsQuery,
} from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { toGraphQLChain } from 'uniswap/src/features/chains/utils'
import {
  SearchResult,
  SearchResultType,
  isNFTCollectionSearchResult,
  isTokenSearchResult,
} from 'uniswap/src/features/search/SearchResult'
import { selectSearchHistory } from 'uniswap/src/features/search/selectSearchHistory'
import { isNativeCurrencyAddress } from 'uniswap/src/utils/currencyId'

export type InterfaceRemoteSearchHistoryItem = GqlSearchToken | GenieCollection

export function useRecentlySearchedAssets(): { data?: InterfaceRemoteSearchHistoryItem[]; loading: boolean } {
  const history = useSelector(selectSearchHistory)
  const shortenedHistory = useMemo(
    () => history.filter((item) => item.type !== SearchResultType.NFTCollection).slice(0, MAX_RECENT_SEARCH_RESULTS),
    [history],
  )

  const tokenContracts = useMemo(() => 
    shortenedHistory.filter(isTokenSearchResult).map((token) => ({
      address: token.address ?? undefined,
      chain: toGraphQLChain(token.chainId),
    })),
    [shortenedHistory]
  )

  const collectionAddresses = useMemo(() =>
    shortenedHistory.filter(isNFTCollectionSearchResult).map((asset) => asset.address).filter((address): address is string => address !== null),
    [shortenedHistory]
  )

  const { data: queryData, loading } = useRecentlySearchedAssetsQuery({
    variables: {
      collectionAddresses,
      contracts: tokenContracts,
    },
    skip: shortenedHistory.length === 0 || (tokenContracts.length === 0 && collectionAddresses.length === 0),
  })

  const data = useMemo((): InterfaceRemoteSearchHistoryItem[] | undefined => {
    if (shortenedHistory.length === 0) {
      return []
    } else if (!queryData) {
      return undefined
    }
    // Collects tokens in a map, so they can later be returned in original order
    const resultsMap: { [key: string]: InterfaceRemoteSearchHistoryItem } = {}
    queryData.tokens?.filter(Boolean).forEach((token) => {
      if (token) {
        resultsMap[token.address ?? getNativeQueryAddress(token.chain)] = token
      }
    })

    const data: InterfaceRemoteSearchHistoryItem[] = []
    const addedKeys = new Set<string>()
    shortenedHistory.forEach((asset: SearchResult) => {
      const result = generateInterfaceHistoryItem(asset, resultsMap)

      if (result) {
        const uniqueKey = result.address || (isNFTCollectionSearchResult(asset) ? asset.address : undefined)
        if (uniqueKey && !addedKeys.has(uniqueKey)) {
          data.push(result)
          addedKeys.add(uniqueKey)
        }
      } else {
        // If no result from generate function, check resultsMap directly
        const key = isTokenSearchResult(asset) ? asset.address : undefined
        if (key && resultsMap[key] && !addedKeys.has(key)) {
          data.push(resultsMap[key])
          addedKeys.add(key)
        }
      }
    })
    return data
  }, [shortenedHistory, queryData])

  return { data, loading }
}

function generateInterfaceHistoryItem(
  asset: SearchResult,
  resultsMap: Record<string, InterfaceRemoteSearchHistoryItem>,
): InterfaceRemoteSearchHistoryItem | undefined {

  if (isNFTCollectionSearchResult(asset)) {
    return asset.address ? resultsMap[asset.address] : undefined
  }

  if (!isTokenSearchResult(asset)) {
    // For pool search results or other types, try to find by address
    if ('address' in asset && asset.address) {
      return resultsMap[asset.address]
    }
    return undefined
  }

  // Handle native assets
  if (isNativeCurrencyAddress(asset.chainId, asset.address)) {
    // Handles special case where wMATIC data needs to be used for MATIC
    const chain = toGraphQLChain(asset.chainId)
    const native = nativeOnChain(asset.chainId)
    const queryAddress = getNativeQueryAddress(chain)
    const result = resultsMap[queryAddress]
    return { ...result, address: NATIVE_CHAIN_ID, ...native }
  }

  if (asset.address) {
    return resultsMap[asset.address.toLowerCase()]
  }

  return undefined
}

function getNativeQueryAddress(chain: Chain) {
  return `NATIVE-${chain}`
}

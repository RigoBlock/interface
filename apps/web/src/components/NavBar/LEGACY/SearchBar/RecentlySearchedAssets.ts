import { NATIVE_CHAIN_ID, nativeOnChain } from 'constants/tokens'
import { SearchToken } from 'graphql/data/SearchTokens'
import { supportedChainIdFromGQLChain } from 'graphql/data/util'
import { useAtom } from 'jotai'
import { atomWithStorage, useAtomValue } from 'jotai/utils'
import { GenieCollection } from 'nft/types'
import { useCallback, useMemo } from 'react'
import {
  Chain,
  NftCollection,
  useRecentlySearchedAssetsQuery,
} from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { logger } from 'utilities/src/logger/logger'
import { getNativeTokenDBAddress } from 'utils/nativeTokens'

type RecentlySearchedAsset = {
  isNft?: boolean
  isPool?: boolean
  address: string
  chain: Chain
}

// Temporary measure used until backend supports addressing by "NATIVE"
const NATIVE_QUERY_ADDRESS_INPUT = null as unknown as string
function getQueryAddress(chain: Chain) {
  return getNativeTokenDBAddress(chain) ?? NATIVE_QUERY_ADDRESS_INPUT
}

const recentlySearchedAssetsAtom = atomWithStorage<RecentlySearchedAsset[]>('recentlySearchedAssets', [])

export function useAddRecentlySearchedAsset() {
  const [searchHistory, updateSearchHistory] = useAtom(recentlySearchedAssetsAtom)

  return useCallback(
    (asset: RecentlySearchedAsset) => {
      // Removes the new asset if it was already in the array
      const newHistory = searchHistory.filter(
        (oldAsset) => !(oldAsset.address === asset.address && oldAsset.chain === asset.chain),
      )
      newHistory.unshift(asset)
      updateSearchHistory(newHistory)
    },
    [searchHistory, updateSearchHistory],
  )
}

// eslint-disable-next-line
export function useRecentlySearchedAssets() {
  const history = useAtomValue(recentlySearchedAssetsAtom)
  const shortenedHistory = useMemo(() => history.slice(0, 4), [history])

  const { data: queryData, loading } = useRecentlySearchedAssetsQuery({
    variables: {
      collectionAddresses: shortenedHistory.filter((asset) => asset.isNft).map((asset) => asset.address),
      contracts: shortenedHistory
        .filter((asset) => !asset.isNft && !asset.isPool)
        .map((token) => ({
          address: token.address === NATIVE_CHAIN_ID ? getQueryAddress(token.chain) : token.address,
          chain: token.chain,
        })),
    },
  })

  const pools: SearchToken[] = shortenedHistory
    .filter((asset) => asset.isPool)
    .map((token) => ({
      address: token.address,
      chain: token.chain,
      id: '',
    }))
  //pools.forEach((pool) => queryData.push(pool))
  //const queryDataWithPools = [queryData, pools].flat().filter(i => i !== undefined)

  const data = useMemo(() => {
    if (shortenedHistory.length === 0) {
      return []
    } else if (!queryData && !pools) {
      return undefined
    }
    // Collects both tokens and collections in a map, so they can later be returned in original order
    const resultsMap: { [key: string]: GenieCollection | SearchToken } = {}

    const queryCollections = queryData?.nftCollections?.edges.map((edge) => edge.node as NonNullable<NftCollection>)
    const collections = queryCollections?.map(
      (queryCollection): GenieCollection => {
        return {
          address: queryCollection.nftContracts?.[0]?.address ?? '',
          isVerified: queryCollection?.isVerified,
          name: queryCollection?.name,
          stats: {
            floor_price: queryCollection?.markets?.[0]?.floorPrice?.value,
            total_supply: queryCollection?.numAssets,
          },
          imageUrl: queryCollection?.image?.url ?? '',
        }
      },
      [queryCollections],
    )
    collections?.forEach((collection) => (resultsMap[collection.address] = collection))
    queryData?.tokens?.filter(Boolean).forEach((token) => {
      if (token) {
        resultsMap[token.address ?? `NATIVE-${token.chain}`] = token
      }
    })

    const data: (SearchToken | GenieCollection)[] = []
    shortenedHistory.forEach((asset, i) => {
      if (asset.address === NATIVE_CHAIN_ID) {
        // Handles special case where wMATIC data needs to be used for MATIC
        const chain = supportedChainIdFromGQLChain(asset.chain)
        if (!chain) {
          logger.error(new Error('Invalid chain retrieved from Search Token/Collection Query'), {
            tags: {
              file: 'RecentlySearchedAssets',
              function: 'useRecentlySearchedAssets',
            },
            extra: { asset },
          })
          return
        }
        const native = nativeOnChain(chain)
        const queryAddress = getQueryAddress(asset.chain)?.toLowerCase() ?? `NATIVE-${asset.chain}`
        const result = resultsMap[queryAddress]
        if (result) {
          data.push({ ...result, address: NATIVE_CHAIN_ID, ...native })
        }
      } else if (!asset.isPool) {
        const result = resultsMap[asset.address]
        if (result) {
          data.push(result)
        }
      } else {
        const result = pools[i]
        // TODO: check why we do not store result for pool and console log instead
        //data.push(result)
        if (result.name) {
          logger.info('RecentlySearchedAssets', 'useRecentlySearchedAssets', result.name, asset.address)
        }
      }
    })
    return data
  }, [pools, queryData, shortenedHistory])

  return { data, loading }
}

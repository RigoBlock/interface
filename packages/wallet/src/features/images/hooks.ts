import { ApolloClient, ApolloLink, from } from '@apollo/client'
import { RetryLink } from '@apollo/client/link/retry'
import { RestLink } from 'apollo-link-rest'
import { config } from 'uniswap/src/config'
import { createNewInMemoryCache } from 'uniswap/src/data/cache'
import { useRestQuery } from 'uniswap/src/data/rest'
import { GqlResult } from 'uniswap/src/data/types'
import { getDatadogApolloLink } from 'utilities/src/logger/datadogLink'
import { isMobileApp } from 'utilities/src/platform'
import { ONE_MINUTE_MS } from 'utilities/src/time/time'

const restLink = new RestLink({
  uri: `${config.simpleHashApiUrl}/api/v0`,
  headers: {
    'X-API-KEY': config.simpleHashApiKey,
  },
})

const retryLink = new RetryLink()

const linkList: ApolloLink[] = [retryLink, restLink]
if (isMobileApp) {
  linkList.push(getDatadogApolloLink())
}

const apolloClient = new ApolloClient({
  link: from(linkList),
  cache: createNewInMemoryCache(),
  defaultOptions: {
    watchQuery: {
      // ensures query is returning data even if some fields errored out
      errorPolicy: 'all',
      fetchPolicy: 'cache-first',
    },
  },
})

type PreviewsResponse = {
  previews: {
    image_small_url: string | null
    image_medium_url: string | null
    image_large_url: string | null
    image_opengraph_url: string | null
    blurhash: string | null
    predominant_color: string | null
  } | null
}

export function useNftPreviewUri(contractAddress: string, tokenId: string): GqlResult<PreviewsResponse> {
  return useRestQuery<PreviewsResponse>(
    `/nfts/ethereum/${contractAddress}/${tokenId}`,
    { contractAddress, tokenId },
    ['previews'],
    { ttlMs: 5 * ONE_MINUTE_MS },
    'GET',
    apolloClient,
  )
}

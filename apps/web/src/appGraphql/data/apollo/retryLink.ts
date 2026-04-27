import { RetryLink } from '@apollo/client/link/retry'

/**
 * Operations that should retry on network failure.
 * These are queries used by useUpdateManualOutage hooks that power the outage banner.
 */
const RETRY_OPERATIONS = new Set([
  // Transaction queries
  'V4TokenTransactions',
  'V3TokenTransactions',
  'V2TokenTransactions',
  'V4Transactions',
  'V3Transactions',
  'V2Transactions',
  // Pool queries
  'TopV4Pools',
  'TopV3Pools',
  'TopV2Pairs',
])

// The RigoBlock GraphQL proxy caches responses for ~2 minutes.
// During cache-miss bursts many queries can trigger 429 rate limits.
// These operations retry with backoff to let the cache warm up.
const RATE_LIMIT_RETRY_OPERATIONS = new Set([
  'PortfolioBalances',
  'MultiplePortfolioBalances',
  'NftsTab',
  'Nfts',
  'TransactionHistoryUpdater',
  'TransactionList',
])

/**
 * Creates an Apollo RetryLink that retries specific operations on network failure.
 * Uses exponential backoff with jitter to avoid thundering herd.
 * Also retries 429 rate-limited responses for portfolio/balance queries.
 */
export function getRetryLink(): RetryLink {
  return new RetryLink({
    delay: {
      initial: 1000,
      max: 10000,
      jitter: true,
    },
    attempts: {
      max: 3,
      retryIf: (error, operation) => {
        const is429 = (error?.networkError as { statusCode?: number } | undefined)?.statusCode === 429
        // Retry 429s for portfolio queries (RigoBlock proxy rate limiting)
        if (is429 && RATE_LIMIT_RETRY_OPERATIONS.has(operation.operationName)) {
          return true
        }
        if (!RETRY_OPERATIONS.has(operation.operationName)) {
          return false
        }
        // Only retry on network errors, not GraphQL errors (validation, auth, etc.)
        return !!error?.networkError
      },
    },
  })
}

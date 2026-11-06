import { UniverseChainId, normalizeTokenAddressForCache } from '@universe/chains'
import { Flex, Text, TouchableArea } from '@universe/mycelium'
import { useMedia, useScrollbarStyles } from '@universe/mycelium/theme-hooks-compat'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { RIGOBLOCK_SUPPORTED_CHAINS } from '~/constants/addresses'
import { useMultiChainAllPoolsData } from '~/state/pool/multichain'

/**
 * RigoBlock: the navbar search searches RigoBlock smart pools (on-chain registry, same batch
 * query as the NavBar pool selector) — NOT upstream's token/pool search. Upstream's results
 * are useless in the fork: they navigate to /explore/*, which is gated off (NotFound). Both
 * the empty state and typed queries render this list (client-side name/symbol/address
 * filter); token search tabs are hidden by the caller.
 */
export const SmartPoolsSearchList = memo(function SmartPoolsSearchListInner({
  chainFilter,
  query,
  onSelect,
}: {
  chainFilter: UniverseChainId | null
  query: string
  onSelect: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const media = useMedia()
  const scrollbarStyles = useScrollbarStyles()

  const { data: allPools } = useMultiChainAllPoolsData(RIGOBLOCK_SUPPORTED_CHAINS)

  const pools = useMemo(() => {
    const filtered = chainFilter ? allPools?.filter((pool) => pool.chainId === chainFilter) : allPools
    const q = query.trim().toLowerCase()
    const searched =
      q.length > 0
        ? filtered?.filter(
            (pool) =>
              pool.symbol.toLowerCase().includes(q) ||
              pool.name.toLowerCase().includes(q) ||
              normalizeTokenAddressForCache(pool.pool).includes(q),
          )
        : filtered
    return [...(searched ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [allPools, chainFilter, query])

  return (
    <Flex grow style={scrollbarStyles}>
      <Flex px="$spacing20" pb="$spacing8">
        <Text variant="subheading2" color="$neutral2">
          {t('nav.search.smartPools.section')}
        </Text>
      </Flex>
      <Flex grow px="$spacing8" pb="$spacing24" $sm={{ px: '$spacing16' }}>
        {pools.length === 0 ? (
          <Flex centered gap="$spacing16" mt="$spacing60">
            <Text variant="body2" color="$neutral2">
              {query.trim().length > 0 ? t('nav.search.smartPools.noMatch') : t('nav.search.smartPools.empty')}
            </Text>
          </Flex>
        ) : (
          pools.map((pool) => (
            <TouchableArea
              key={`${pool.chainId}:${pool.pool}`}
              borderRadius="$rounded16"
              p="$spacing12"
              onPress={() => {
                navigate(`/smart-pool/${pool.chainId ?? UniverseChainId.Mainnet}/${pool.pool}`)
                onSelect()
              }}
            >
              <Flex row justifyContent="space-between" alignItems="center">
                <Flex>
                  <Text variant="body1" color="$neutral1">
                    {pool.symbol}
                  </Text>
                  <Text variant="body3" color="$neutral2" numberOfLines={1}>
                    {pool.name}
                  </Text>
                </Flex>
                {!media.sm && (
                  <Text variant="body4" color="$neutral3">
                    {pool.pool.slice(0, 6)}…{pool.pool.slice(-4)}
                  </Text>
                )}
              </Flex>
            </TouchableArea>
          ))
        )}
      </Flex>
    </Flex>
  )
})

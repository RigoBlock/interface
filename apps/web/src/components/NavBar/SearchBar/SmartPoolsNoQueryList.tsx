import { useMedia, useScrollbarStyles } from '@universe/mycelium/theme-hooks-compat'
import { Flex, Text, TouchableArea } from '@universe/mycelium'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { UniverseChainId } from '@universe/chains'
import { RIGOBLOCK_SUPPORTED_CHAINS } from '~/constants/addresses'
import { useMultiChainAllPoolsData } from '~/state/pool/multichain'

/**
 * RigoBlock fork: the navbar search's no-query state lists RigoBlock smart pools
 * (from the on-chain registry, same batch query as the NavBar pool selector) instead of
 * upstream's trending-token shelf. Typing a query still falls through to the regular
 * results list; this only replaces what the modal shows when opened.
 */
export const SmartPoolsNoQueryList = memo(function SmartPoolsNoQueryListInner({
  chainFilter,
  onSelect,
}: {
  chainFilter: UniverseChainId | null
  onSelect: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const media = useMedia()
  const scrollbarStyles = useScrollbarStyles()

  const { data: allPools } = useMultiChainAllPoolsData(RIGOBLOCK_SUPPORTED_CHAINS)

  const pools = useMemo(() => {
    const filtered = chainFilter ? allPools?.filter((pool) => pool.chainId === chainFilter) : allPools
    return [...(filtered ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [allPools, chainFilter])

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
              {t('nav.search.smartPools.empty')}
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
                  <Text variant="body4" color="$neutral3" fontFamily="$mono">
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

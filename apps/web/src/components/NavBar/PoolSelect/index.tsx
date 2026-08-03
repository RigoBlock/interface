import { Currency, Token } from '@uniswap/sdk-core'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { styled, Flex, Text } from 'ui/src'
import { Caret } from 'ui/src/components/icons/Caret'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { SwitchNetworkAction } from '~/components/Popups/types'
import CurrencySearchModal from '~/components/SearchModal/CurrencySearchModal'
import { useActiveSmartPool, useSelectActiveSmartPool } from '~/state/application/hooks'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'

const PoolSelectButton = styled(Flex, {
  row: true,
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '$spacing8',
  backgroundColor: '$surface3',
  borderRadius: '$roundedFull',
  paddingVertical: '$spacing8',
  paddingHorizontal: '$spacing12',
  height: 40,
  maxWidth: 240,
  cursor: 'pointer',
  borderWidth: 1,
  borderColor: '$surface3',
  borderStyle: 'solid',
  hoverStyle: {
    backgroundColor: '$surface3Hovered',
    borderColor: '$surface3Hovered',
  },
  pressStyle: {
    backgroundColor: '$surface1Pressed',
    borderColor: '$surface3',
  },

  // On small screens, allow the name to wrap and grow slightly
  $md: {
    height: 'auto',
    minHeight: 40,
    maxWidth: 160,
  },
})

interface PoolSelectProps {
  operatedPools: Token[]
}

const PoolSelect: React.FC<PoolSelectProps> = ({ operatedPools }) => {
  const [showModal, setShowModal] = useState(false)
  const activeSmartPool = useActiveSmartPool()
  const onPoolSelect = useSelectActiveSmartPool()
  const hasInitialized = useRef(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const isPortfolio = pathname.startsWith('/portfolio')
  const portfolioAddress = useMemo(() => {
    if (!isPortfolio) {
      return undefined
    }
    const segments = pathname.split('/').filter(Boolean)
    return segments[1]
  }, [isPortfolio, pathname])

  const activePoolExists = operatedPools.some(
    (pool) => normalizeTokenAddressForCache(pool.address) === normalizeTokenAddressForCache(activeSmartPool.address ?? null),
  )

  useEffect(() => {
    if (!hasInitialized.current && (!activeSmartPool.name || !activePoolExists)) {
      onPoolSelect(operatedPools[0])
      hasInitialized.current = true
    }
  }, [activePoolExists, activeSmartPool.name, onPoolSelect, operatedPools])

  const poolsAsCurrrencies = useMemo(
    () =>
      operatedPools.map((pool: Token) => ({
        currency: pool,
        currencyId: pool.address,
        safetyLevel: null,
        safetyInfo: null,
        spamCode: null,
        logoUrl: null,
        isSpam: null,
      })) as CurrencyInfo[],
    [operatedPools],
  )

  const handleSelectPool = useCallback(
    (pool: Currency) => {
      onPoolSelect(pool)
      if (isPortfolio && pool.isToken) {
        navigate(`/portfolio/${pool.address}`)
      }
      setShowModal(false)
    },
    [isPortfolio, navigate, onPoolSelect],
  )

  const selectorLabel = useMemo(() => {
    if (!isPortfolio) {
      return activeSmartPool.name || 'Select pool'
    }
    const selectedPool = portfolioAddress
      ? operatedPools.find(
          (pool) => normalizeTokenAddressForCache(pool.address) === normalizeTokenAddressForCache(portfolioAddress),
        )
      : undefined
    return selectedPool?.name ?? activeSmartPool.name ?? 'Select pool'
  }, [isPortfolio, portfolioAddress, operatedPools, activeSmartPool.name])

  if (!isPortfolio && !activeSmartPool.name) {
    return null
  }

  return (
    <>
      <PoolSelectButton className="operated-pool-select-button" onPress={() => setShowModal(true)}>
        <Text variant="buttonLabel3" color="$neutral1" numberOfLines={1} flexShrink={1} minWidth={0}>
          {selectorLabel}
        </Text>
        <Caret color="$neutral2" direction="s" size="$icon.16" />
      </PoolSelectButton>

      <CurrencySearchModal
        isOpen={showModal}
        onDismiss={() => setShowModal(false)}
        onCurrencySelect={handleSelectPool}
        operatedPools={poolsAsCurrrencies}
        shouldDisplayPoolsOnly={true}
        switchNetworkAction={SwitchNetworkAction.Swap}
      />
    </>
  )
}

export default PoolSelect

import { Currency, Token } from '@uniswap/sdk-core';
import { ButtonGray } from 'components/Button/buttons'
import CurrencySearchModal from 'components/SearchModal/CurrencySearchModal'
import styled from 'lib/styled-components'
import React, { useCallback, useEffect, useState } from 'react';
import { useActiveSmartPool, useSelectActiveSmartPool } from 'state/application/hooks';
import { PoolWithChain } from 'state/application/reducer';
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types';

const PoolSelectButton = styled(ButtonGray)<{
    visible: boolean
    selected: boolean
    hideInput?: boolean
    disabled?: boolean
  }>`
    align-items: center;
    background-color: ${({ selected, theme }) => (selected ? theme.surface1 : theme.accent1)};
    opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
    box-shadow: ${({ selected }) => (selected ? 'none' : '0px 6px 10px rgba(0, 0, 0, 0.075)')};
    box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
    color: ${({ selected, theme }) => (selected ? theme.neutral1 : theme.white)};
    cursor: pointer;
    border-radius: 16px;
    outline: none;
    user-select: none;
    border: none;
    font-size: 24px;
    font-weight: 500;
    height: ${({ hideInput }) => (hideInput ? '2.8rem' : '2.4rem')};
    width: ${({ hideInput }) => (hideInput ? '100%' : 'initial')};
    padding: 0 8px;
    justify-content: space-between;
    margin-bottom: 16px;
    margin-left: ${({ hideInput }) => (hideInput ? '0' : '12px')};
    visibility: ${({ visible }) => (visible ? 'visible' : 'hidden')};
    display: flex;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (max-width: 910px) { 
      white-space: normal;
      word-wrap: break-word;
      height: auto;
      min-height: 3rem;
    }

    :focus,
    :hover {
      background-color: ${({ selected, theme }) => (selected ? theme.surface2 : theme.accent1)};
    }
`;

const StyledTokenName = styled.span<{ active?: boolean }>`
  ${({ active }) => (active ? '  margin: 0 0.25rem 0 0.25rem;' : '  margin: 0 0.25rem 0 0.25rem;')}
  font-size: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  white-space: nowrap;

  @media (max-width: 910px) {
    white-space: normal;
    word-wrap: break-word;
  }
`;

interface PoolSelectProps {
  operatedPools: PoolWithChain[];
}

const PoolSelect: React.FC<PoolSelectProps> = ({ operatedPools }) => {
  const [showModal, setShowModal] = useState(false);
  const activeSmartPool = useActiveSmartPool();
  const onPoolSelect = useSelectActiveSmartPool();

  // Deduplicate pools by address (keep first occurrence)
  const uniquePools = React.useMemo(() => {
    const seen = new Set<string>();
    return operatedPools.filter(pool => {
      if (seen.has(pool.address)) {
        return false;
      }
      seen.add(pool.address);
      return true;
    });
  }, [operatedPools]);

  // Create a map for quick chainId lookup by address
  const poolChainMap = React.useMemo(() => 
    new Map(uniquePools.map(pool => [pool.address, pool.chainId])),
    [uniquePools]
  );

  // Convert PoolWithChain[] to Token[] for display
  const poolsAsTokens = React.useMemo(() => 
    uniquePools.map((pool) => 
      new Token(pool.chainId, pool.address, pool.decimals, pool.symbol, pool.name)
    ),
    [uniquePools]
  );

  // on chain switch revert to default pool if selected does not exist
  const activePoolExistsInList = uniquePools?.some(pool => pool.address === activeSmartPool?.address);

  // initialize selected pool - use ref to prevent re-initialization
  const hasInitialized = React.useRef(false);
  
  useEffect(() => {
    if (!hasInitialized.current && (!activeSmartPool?.name || !activePoolExistsInList)) {
      if (poolsAsTokens.length > 0 && uniquePools.length > 0) {
        const firstPool = uniquePools[0];
        onPoolSelect(poolsAsTokens[0], firstPool.chainId);
      }
      hasInitialized.current = true;
    }
  }, [activePoolExistsInList, activeSmartPool?.name, poolsAsTokens, uniquePools, onPoolSelect])

  // Memoize poolsAsCurrrencies to prevent recreation on every render
  const poolsAsCurrrencies = React.useMemo(() => 
    poolsAsTokens.map((pool: Token) => ({
      currency: pool,
      currencyId: pool.address,
      safetyLevel: null,
      safetyInfo: null,
      spamCode: null,
      logoUrl: null,
      isSpam: null,
      // Store chainId using our map for safer access
      chainId: poolChainMap.get(pool.address),
    })) as CurrencyInfo[]
  , [poolsAsTokens, poolChainMap]);

  const handleSelectPool = useCallback((pool: Currency) => {
    // Find the chain ID for the selected pool using our map
    const poolAddress = pool.isToken ? pool.address : '';
    const chainId = poolChainMap.get(poolAddress);
    onPoolSelect(pool, chainId);
    setShowModal(false);
  }, [onPoolSelect, poolChainMap]);

  return (
    <>
      {activeSmartPool && (
        <PoolSelectButton
          disabled={false}
          visible={true}
          selected={true}
          hideInput={false}
          className="operated-pool-select-button"
          onClick={() => setShowModal(true)}
        >
          <StyledTokenName className="pool-name-container" active={true}>
            {activeSmartPool.name}
          </StyledTokenName>
        </PoolSelectButton>
      )}

      <CurrencySearchModal
        isOpen={showModal}
        onDismiss={() => setShowModal(false)}
        onCurrencySelect={handleSelectPool}
        operatedPools={poolsAsCurrrencies}
        shouldDisplayPoolsOnly={true}
      />
    </>
  );
};

export default PoolSelect;
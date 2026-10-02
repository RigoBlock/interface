import { useMemo } from 'react'
import type { Rwa } from 'uniswap/src/data/apiClients/dataApiService/rwa/types'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { Table } from '~/components/Table'
import type { TableEmptyState } from '~/components/Table/types'
import type { OrderDirection } from '~/data/util'
import { EXPANDABLE_ASSET_TABLE_ROW_HEIGHT } from '~/pages/Explore/rwa/table/expandableAssetTableConstants'
import {
  buildExpandableAssetTableRows,
  getExpandableAssetSubRows,
  getExpandableAssetTableRowId,
  type ExpandableAssetTableRow,
} from '~/pages/Explore/rwa/table/expandableAssetTableRowUtils'
import { useExpandableAssetTableColumns } from '~/pages/Explore/rwa/table/hooks/useExpandableAssetTableColumns'
import { useExpandableAssetTableExpandableRow } from '~/pages/Explore/rwa/table/hooks/useExpandableAssetTableExpandableRow'
import type { StocksSortMethod } from '~/pages/Explore/rwa/table/stocksTableSortStore'
import { useChainIdFromUrlParam } from '~/utils/params/chainParams'

export type ExpandableAssetTableProps = {
  assets: Rwa[]
  /** 1-based Explore rank per asset, captured before search filtering (see `useRwaExploreTableShell`). */
  rankByAsset: ReadonlyMap<Rwa, number>
  isLoading: boolean
  isError: boolean
  loadMore?: (params: { onComplete?: () => void }) => void
  enableSorting?: boolean
  sortMethod?: StocksSortMethod
  orderDirection?: OrderDirection
  emptyState?: TableEmptyState
}

/** Expandable asset table — parent rows expand to per-issuer breakdown.
 * Ranked RWA list is small enough to render without row virtualization. */
export function ExpandableAssetTable({
  assets,
  rankByAsset,
  isLoading,
  isError,
  loadMore,
  enableSorting = false,
  sortMethod,
  orderDirection,
  emptyState,
}: ExpandableAssetTableProps): JSX.Element {
  const { chains: enabledChainIds } = useEnabledChains()
  const chainFilter = useChainIdFromUrlParam()

  const showLoadingSkeleton = isLoading

  const data = useMemo(
    () => buildExpandableAssetTableRows({ assets, enabledChainIds, chainFilter, rankByAsset }),
    [assets, enabledChainIds, chainFilter, rankByAsset],
  )

  const columns = useExpandableAssetTableColumns({
    showLoadingSkeleton,
    enabledChainIds,
    chainFilter,
    enableSorting,
    sortMethod: enableSorting ? sortMethod : undefined,
    orderDirection: enableSorting ? orderDirection : undefined,
  })

  const { rowWrapper, renderUnifiedExpandableRow } = useExpandableAssetTableExpandableRow()

  return (
    <Table<ExpandableAssetTableRow>
      columns={columns}
      data={data}
      loading={isLoading}
      error={isError}
      emptyState={emptyState}
      loadMore={loadMore}
      rowHeight={EXPANDABLE_ASSET_TABLE_ROW_HEIGHT}
      compactRowHeight={EXPANDABLE_ASSET_TABLE_ROW_HEIGHT}
      maxWidth={1200}
      defaultPinnedColumns={['index', 'tokenDescription']}
      getRowId={getExpandableAssetTableRowId}
      getSubRows={getExpandableAssetSubRows}
      singleExpandedRow
      rowWrapper={rowWrapper}
      renderUnifiedExpandableRow={renderUnifiedExpandableRow}
    />
  )
}

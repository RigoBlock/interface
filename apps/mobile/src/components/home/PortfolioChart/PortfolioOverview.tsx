import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PortfolioChart } from 'src/components/home/PortfolioChart/PortfolioChart'
import { usePortfolioChartData } from 'src/components/home/PortfolioChart/usePortfolioChartData'
import { Flex, TouchableArea } from 'ui/src'
import { useLayoutAnimationOnChange } from 'ui/src/animations/layout'
import { AnglesMaximize } from 'ui/src/components/icons/AnglesMaximize'
import { AnglesMinimize } from 'ui/src/components/icons/AnglesMinimize'
import { PortfolioBalance } from 'uniswap/src/features/portfolio/PortfolioBalance/PortfolioBalance'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'

interface PortfolioChartSectionProps {
  evmAddress: string
  chainIds: number[]
  isPnLEnabled: boolean
}

export function PortfolioOverview({ evmAddress, chainIds, isPnLEnabled }: PortfolioChartSectionProps): JSX.Element {
  const [isChartExpanded, setIsChartExpanded] = useState(false)
  const [chartPeriod, setChartPeriod] = useState(ChartPeriod.DAY)

  const {
    data: chartData,
    loading: chartLoading,
    chartColor,
  } = usePortfolioChartData({
    evmAddress,
    chartPeriod,
    chainIds,
    enabled: isPnLEnabled,
  })

  const canShowChart = isPnLEnabled && chartData.length > 0

  useLayoutAnimationOnChange(isChartExpanded)

  useEffect(() => {
    // Only collapse when we definitively have no data (not during a loading/refetch transition).
    // Without this guard, changing the chart period triggers a refetch that temporarily empties
    // chartData, which would incorrectly collapse the expanded chart.
    if (!canShowChart && !chartLoading) {
      setIsChartExpanded(false)
    }
  }, [canShowChart, chartLoading])

  const toggleChartExpanded = useCallback(() => {
    setIsChartExpanded((prev) => !prev)
  }, [])

  const chartToggleIcon = useMemo((): JSX.Element | undefined => {
    if (!canShowChart) {
      return undefined
    }
    const Icon = isChartExpanded ? AnglesMinimize : AnglesMaximize
    return (
      <Flex ml="$spacing4">
        <Icon color="$neutral3" size="$icon.16" />
      </Flex>
    )
  }, [canShowChart, isChartExpanded])

  return (
    <>
      <TouchableArea
        disabled={!canShowChart}
        testID={TestID.PortfolioChartToggle}
        activeOpacity={1}
        onPress={toggleChartExpanded}
      >
        <Flex py="$spacing20" px="$spacing24">
          {canShowChart && !isChartExpanded ? (
            <Flex row alignItems="flex-start">
              <Flex flex={1}>
                <PortfolioBalance evmOwner={evmAddress} endText={chartToggleIcon} chartPeriod={chartPeriod} />
              </Flex>
              <PortfolioChart
                data={chartData}
                loading={chartLoading}
                chartColor={chartColor}
                isExpanded={false}
                chartPeriod={chartPeriod}
                onChartPeriodChange={setChartPeriod}
              />
            </Flex>
          ) : (
            <PortfolioBalance
              evmOwner={evmAddress}
              endText={chartToggleIcon}
              chartPeriod={canShowChart ? chartPeriod : undefined}
            />
          )}
        </Flex>
      </TouchableArea>
      {canShowChart && isChartExpanded && (
        <Flex px="$spacing24">
          <PortfolioChart
            data={chartData}
            loading={chartLoading}
            chartColor={chartColor}
            isExpanded={true}
            chartPeriod={chartPeriod}
            onChartPeriodChange={setChartPeriod}
          />
        </Flex>
      )}
    </>
  )
}

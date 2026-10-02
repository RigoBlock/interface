import { Button, Flex } from '@universe/mycelium'
import { useTranslation } from 'react-i18next'
import { useLiquidityChartStoreActions } from '~/features/Liquidity/charts/D3LiquidityRangeInput/D3LiquidityRangeChart/store/useLiquidityChartStore'

export function ResetActionButton() {
  const { t } = useTranslation()
  const { reset } = useLiquidityChartStoreActions()
  return (
    <Flex>
      <Button size="xsmall" emphasis="tertiary" onPress={() => reset()}>
        {t('common.button.reset')}
      </Button>
    </Flex>
  )
}

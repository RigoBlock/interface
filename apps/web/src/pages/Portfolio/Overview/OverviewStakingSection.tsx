import { LoadingBubble } from 'components/Tokens/loading'
import { usePortfolioStaking } from 'pages/Portfolio/hooks/usePortfolioStaking'
import { Box, ChevronRight } from 'react-feather'
import { Trans } from 'react-i18next'
import { Flex } from 'ui/src/components/layout'
import { Text } from 'ui/src/components/text'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'

interface OverviewStakingSectionProps {
  address?: string
  onViewStaking: () => void
}

export function OverviewStakingSection({ address, onViewStaking }: OverviewStakingSectionProps) {
  const { totalStakeAmount, totalStakeUSD, hasAnyStake } = usePortfolioStaking({ address })
  const { formatCurrencyAmount } = useLocalizationContext()

  if (!hasAnyStake) {
    return null
  }

  return (
    <Box>
      <Flex row alignItems="center" justifyContent="space-between" py="$spacing16">
        <Box>
          <Text variant="subheading2" color="$neutral1" onPress={onViewStaking}>
            <Trans>Staking</Trans>
          </Text>
          <Box>
            {totalStakeUSD ? (
              <Text variant="heading3" color="$neutral1" onPress={onViewStaking}>
                {formatCurrencyAmount({
                  value: totalStakeUSD,
                  type: NumberType.FiatStandard,
                  placeholder: '–',
                })}
              </Text>
            ) : (
              <LoadingBubble height={24} width={80} />
            )}
            {totalStakeAmount && (
              <Text variant="body3" color="$neutral2" onPress={onViewStaking} mt="$spacing2">
                {formatCurrencyAmount({
                  value: totalStakeAmount,
                  type: NumberType.TokenNonTx,
                  placeholder: '–',
                })}
              </Text>
            )}
          </Box>
        </Box>

        <Text alignItems="center" gap="$spacing4" onPress={onViewStaking} hoverStyle={{ opacity: 0.8 }}>
          <Text variant="buttonLabel3" color="$accent1">
            <Trans>View staking balances</Trans>
          </Text>
          <ChevronRight size="$icon.16" color="$accent1" />
        </Text>
      </Flex>
    </Box>
  )
}

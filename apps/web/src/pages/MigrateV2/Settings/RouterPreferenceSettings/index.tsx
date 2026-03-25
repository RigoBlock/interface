import Column from '~/components/deprecated/Column'
import { RowBetween, RowFixed } from '~/components/deprecated/Row'
import { deprecatedStyled as styled } from '~/lib/deprecated-styled'
import { Trans } from 'react-i18next'
import { RouterPreference } from '~/state/routing/types'
import { useRouterPreference } from '~/state/user/hooks'
import { ThemedText } from '~/theme/components'
import { ExternalLink } from '~/theme/components/Links'
import { Text, Switch } from 'ui/src'

const InlineLink = styled(ThemedText.BodySmall)`
  color: ${({ theme }) => theme.accent1};
  display: inline;
  cursor: pointer;
  &:hover {
    opacity: 0.8;
  }
`

export default function RouterPreferenceSettings() {
  const [routerPreference, setRouterPreference] = useRouterPreference()

  return (
    <RowBetween gap="sm">
      <RowFixed>
        <Column gap="xs">
          <ThemedText.BodySecondary>
            <Text variant="body2">UniswapX</Text>
          </ThemedText.BodySecondary>
          <ThemedText.BodySmall color="neutral2">
            <Trans i18nKey="routing.aggregateLiquidity" />{' '}
            <ExternalLink href="https://support.uniswap.org/hc/en-us/articles/17515415311501">
              <InlineLink>Learn more</InlineLink>
            </ExternalLink>
          </ThemedText.BodySmall>
        </Column>
      </RowFixed>
      <Switch
        testID="toggle-uniswap-x-button"
        checked={routerPreference === RouterPreference.X}
        variant="branded"
        onCheckedChange={() => {
          setRouterPreference(routerPreference === RouterPreference.X ? RouterPreference.API : RouterPreference.X)
        }}
      />
    </RowBetween>
  )
}

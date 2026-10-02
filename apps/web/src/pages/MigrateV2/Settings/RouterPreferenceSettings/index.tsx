import { Text } from '@universe/mycelium'
import { Trans } from 'react-i18next'
import { Switch } from 'ui/src'
import Column from '~/components/deprecated/Column'
import { RowBetween, RowFixed } from '~/components/deprecated/Row'
import { deprecatedStyled as styled } from '~/lib/deprecated-styled'
import { RouterPreference } from '~/state/routing/types'
import { useRouterPreference } from '~/state/user/hooks'
import { ExternalLink } from '~/theme/components/Links'

const InlineLink = styled.span`
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
    <RowBetween>
      <RowFixed>
        <Column gap="xs">
          <Text variant="body2">UniswapX</Text>
          <Text variant="body3" color="$neutral2">
            <Trans i18nKey="routing.aggregateLiquidity" />{' '}
            <ExternalLink href="https://support.uniswap.org/hc/en-us/articles/17515415311501">
              <InlineLink>Learn more</InlineLink>
            </ExternalLink>
          </Text>
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

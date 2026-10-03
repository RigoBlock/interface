import { Flex } from '@universe/mycelium'
import { ArrowUpCircle, CheckCircle } from 'react-feather'
import { Trans } from 'react-i18next'
import { useTheme } from 'styled-components'
import { ModalCloseIcon } from 'ui/src'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import Circle from '~/assets/images/blue-loader.svg'
import { AutoColumn, ColumnCenter } from '~/components/deprecated/Column'
import { RowBetween } from '~/components/deprecated/Row'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import { CustomLightSpinner } from '~/theme/components/icons/spinner'
import { ExternalLink } from '~/theme/components/Links'

const ConfirmOrLoadingWrapper = styled.div`
  width: 100%;
  padding: 24px;
`

const ConfirmedIcon = styled(ColumnCenter)`
  padding: 60px 0;
`

// Local sub-header style (was the ThemedText.DeprecatedSubHeader preset before the upstream cleanup).
const SubHeaderText = styled.span`
  font-weight: 485;
  font-size: 14px;
  letter-spacing: -0.01em;
`

export function LoadingView({ children, onDismiss }: { children: any; onDismiss: () => void }) {
  return (
    <ConfirmOrLoadingWrapper>
      <RowBetween>
        <Flex />
        <ModalCloseIcon onClose={onDismiss} />
      </RowBetween>
      <ConfirmedIcon>
        <CustomLightSpinner src={Circle} alt="loader" size="90px" />
      </ConfirmedIcon>
      <AutoColumn gap="100px" justify="center">
        {children}
        <SubHeaderText>
          <Trans i18nKey="common.confirm" />
        </SubHeaderText>
      </AutoColumn>
    </ConfirmOrLoadingWrapper>
  )
}

export function SubmittedView({
  children,
  onDismiss,
  transactionSuccess,
  hash,
}: {
  children: any
  onDismiss: () => void
  transactionSuccess: boolean
  hash?: string
}) {
  const theme = useTheme()
  const { chainId } = useAccount()

  return (
    <ConfirmOrLoadingWrapper>
      <RowBetween>
        <Flex />
        <ModalCloseIcon onClose={onDismiss} />
      </RowBetween>
      <ConfirmedIcon>
        {!transactionSuccess ? (
          <ArrowUpCircle strokeWidth={0.5} size={90} color={theme.accent1} />
        ) : (
          <CheckCircle strokeWidth={0.5} size={90} color={theme.success} />
        )}
      </ConfirmedIcon>
      <AutoColumn gap="100px" justify="center">
        {children}
        {chainId && hash && (
          <ExternalLink
            href={getExplorerLink({
              chainId,
              data: hash,
              type: ExplorerDataType.TRANSACTION,
            })}
            style={{ marginLeft: '4px' }}
          >
            <SubHeaderText>
              <Trans i18nKey="common.etherscan.link" />
            </SubHeaderText>
          </ExternalLink>
        )}
      </AutoColumn>
    </ConfirmOrLoadingWrapper>
  )
}

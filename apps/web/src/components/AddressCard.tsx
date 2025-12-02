
import { Trans } from 'react-i18next'
import { LightCard } from 'components/Card/cards'
import { AutoColumn } from 'components/deprecated/Column'
import Row from 'components/deprecated/Row'
import styled from 'lib/styled-components'
import { CopyHelper } from 'theme/components/CopyHelper'
import { ExternalLink } from 'theme/components/Links'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { shortenAddress } from 'utilities/src/addresses'

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.neutral2};
  font-size: 14px;
  text-align: center;
  margin-right: 4px;
  font-weight: 500;
`

// TODO: refactor IconHoverText usage
const IconHoverText = styled.span`
  color: ${({ theme }) => theme.neutral1};
  position: absolute;
  top: 28px;
  border-radius: 8px;
  transform: translateX(-50%);
  opacity: 0;
  font-size: 12px;
  padding: 5px;
  left: 10px;
`

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  & > a,
  & > button {
    margin-right: 0px;
    margin-left: 40px;
  }

  & > button:last-child {
    margin-left: 8px;
    ${IconHoverText}:last-child {
      right: 0px;
    }
  }
  justify-content: center;
`

function AddressCard({
  address,
  chainId,
  label,
}: {
  address?: string | null
  chainId?: number | null
  label?: string | null
}) {
  if (!address || !chainId || !label) {
    return null
  }

  return (
    <LightCard padding="12px ">
      <AutoColumn gap="md">
        <ExtentsText>
          <Trans>{label}</Trans>
        </ExtentsText>
      </AutoColumn>
      {/*<AutoColumn gap="8px" justify="center">#*/}
      <AutoColumn gap="md">
        <ExtentsText>
          {typeof chainId === 'number' && address ? (
            <IconContainer>
              <CopyHelper iconSize={20} iconPosition="right" toCopy={address}>
                <Row width="100px" padding="8px 4px">
                  <ExternalLink href={getExplorerLink({chainId, data: address, type: ExplorerDataType.ADDRESS})}>
                    <Trans>{shortenAddress({ address })}</Trans>
                  </ExternalLink>
                </Row>
              </CopyHelper>
            </IconContainer>
          ) : null}
        </ExtentsText>
        {/*</AutoColumn>
          <ExtentsText>
            <Trans>{poolAddress}</Trans>
          </ExtentsText>
        */}
      </AutoColumn>
    </LightCard>
  )
}

export { AddressCard }
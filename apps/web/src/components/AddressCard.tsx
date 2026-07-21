import { Trans } from 'react-i18next'
import { Checkmark } from 'ui/src/components/icons/Checkmark'
import { CopySheets } from 'ui/src/components/icons/CopySheets'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { shortenAddress } from 'utilities/src/addresses'
import { LightCard } from '~/components/Card/cards'
import { AutoColumn } from '~/components/deprecated/Column'
import useCopyClipboard from '~/hooks/useCopyClipboard'
import styled from '~/lib/deprecated-styled'
import { ExternalLink } from '~/theme/components/Links'

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.neutral2};
  font-size: 14px;
  text-align: center;
  margin-right: 4px;
  font-weight: 500;
`

const AddressRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`

const CopyButton = styled.button`
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: ${({ theme }) => theme.neutral2};

  :hover {
    color: ${({ theme }) => theme.accent1};
  }
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
  const [isCopied, copy] = useCopyClipboard()

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
      <AutoColumn gap="md">
        <ExtentsText>
          {typeof chainId === 'number' && address ? (
            <AddressRow>
              {/* Clicking the address opens the block explorer; the icon on the right copies it */}
              <ExternalLink href={getExplorerLink({ chainId, data: address, type: ExplorerDataType.ADDRESS })}>
                <Trans>{shortenAddress({ address })}</Trans>
              </ExternalLink>
              <CopyButton onClick={() => copy(address)} aria-label="Copy address">
                {isCopied ? (
                  <Checkmark size="$icon.16" color="$statusSuccess" />
                ) : (
                  <CopySheets size="$icon.16" color="$neutral2" />
                )}
              </CopyButton>
            </AddressRow>
          ) : null}
        </ExtentsText>
      </AutoColumn>
    </LightCard>
  )
}

export { AddressCard }

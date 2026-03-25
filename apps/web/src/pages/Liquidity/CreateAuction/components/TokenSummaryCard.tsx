import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea } from 'ui/src'
import { Edit } from 'ui/src/components/icons/Edit'
import { CurrencyLogo } from 'uniswap/src/components/CurrencyLogo/CurrencyLogo'
import { TokenLogo } from 'uniswap/src/components/CurrencyLogo/TokenLogo'
import { useCreateAuctionStore } from '~/pages/Liquidity/CreateAuction/CreateAuctionContext'
import { TokenMode } from '~/pages/Liquidity/CreateAuction/types'

const TOKEN_LOGO_SIZE = 60

export function TokenSummaryCard({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation()
  const tokenForm = useCreateAuctionStore((state) => state.tokenForm)

  const name =
    tokenForm.mode === TokenMode.CREATE_NEW
      ? tokenForm.createNew.name || t('toucan.createAuction.step.tokenInfo.namePlaceholder')
      : (tokenForm.existing.existingTokenCurrencyInfo?.currency.name ?? '')

  const symbol =
    tokenForm.mode === TokenMode.CREATE_NEW
      ? tokenForm.createNew.symbol
      : (tokenForm.existing.existingTokenCurrencyInfo?.currency.symbol ?? '')

  return (
    <Flex
      backgroundColor="$surface1"
      borderWidth="$spacing1"
      borderColor="$surface3"
      borderRadius="$rounded20"
      p="$spacing24"
      row
      alignItems="center"
    >
      <Flex mr="$spacing16" flexShrink={0}>
        {tokenForm.mode === TokenMode.CREATE_NEW ? (
          <TokenLogo
            url={tokenForm.createNew.imageUrl || null}
            symbol={tokenForm.createNew.symbol}
            name={tokenForm.createNew.name}
            chainId={tokenForm.createNew.network}
            size={TOKEN_LOGO_SIZE}
          />
        ) : (
          <CurrencyLogo currencyInfo={tokenForm.existing.existingTokenCurrencyInfo ?? null} size={TOKEN_LOGO_SIZE} />
        )}
      </Flex>
      <Flex flex={1} gap="$spacing2">
        <Text variant="heading3" color="$neutral1">
          {name}
        </Text>
        <Text variant="body2" color="$neutral2">
          {symbol}
        </Text>
      </Flex>
      <TouchableArea
        backgroundColor="$surface3"
        borderRadius="$rounded12"
        px="$spacing12"
        py="$spacing8"
        flexDirection="row"
        alignItems="center"
        gap="$spacing8"
        onPress={onEdit}
      >
        <Edit size="$icon.20" color="$neutral1" />
        <Text variant="buttonLabel3" color="$neutral1">
          {t('common.button.edit')}
        </Text>
      </TouchableArea>
    </Flex>
  )
}

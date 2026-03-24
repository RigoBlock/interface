import { useTranslation } from 'react-i18next'
import { Flex } from 'ui/src'
import {
  useCreateAuctionStore,
  useCreateAuctionStoreActions,
} from '~/pages/Liquidity/CreateAuction/CreateAuctionContext'
import { CreateNewTokenForm } from '~/pages/Liquidity/CreateAuction/components/CreateNewTokenForm'
import { ExistingTokenForm } from '~/pages/Liquidity/CreateAuction/components/ExistingTokenForm'
import { HookTile } from '~/pages/Liquidity/CreateAuction/components/HookTile'
import { TokenMode } from '~/pages/Liquidity/CreateAuction/types'

export function AddTokenInfoStep() {
  const { t } = useTranslation()
  const tokenForm = useCreateAuctionStore((state) => state.tokenForm)
  const { setTokenMode } = useCreateAuctionStoreActions()

  const isCreateNew = tokenForm.mode === TokenMode.CREATE_NEW

  const switchToCreateNew = () => setTokenMode(TokenMode.CREATE_NEW)
  const switchToExisting = () => setTokenMode(TokenMode.EXISTING)

  return (
    <Flex gap="$spacing16">
      <Flex row gap="$spacing12">
        <HookTile
          selected={isCreateNew}
          title={t('toucan.createAuction.step.tokenInfo.createNew')}
          description={t('toucan.createAuction.step.tokenInfo.createNew.description')}
          onPress={switchToCreateNew}
        />
        <HookTile
          selected={!isCreateNew}
          title={t('toucan.createAuction.step.tokenInfo.existing')}
          description={t('toucan.createAuction.step.tokenInfo.existing.description')}
          onPress={switchToExisting}
        />
      </Flex>
      <Flex
        backgroundColor="$surface1"
        borderWidth="$spacing1"
        borderColor="$surface3"
        borderRadius="$rounded20"
        p="$spacing24"
        gap="$spacing24"
      >
        {isCreateNew ? (
          <CreateNewTokenForm createNew={tokenForm.createNew} />
        ) : (
          <ExistingTokenForm existing={tokenForm.existing} />
        )}
      </Flex>
    </Flex>
  )
}

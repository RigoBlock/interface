import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { NativeSyntheticEvent } from 'react-native'
import { ContextMenuAction, ContextMenuOnPressNativeEvent } from 'react-native-context-menu-view'
import { useDispatch, useSelector } from 'react-redux'
import { GeneratedIcon, isWeb, useIsDarkMode } from 'ui/src'
import { Eye, EyeOff } from 'ui/src/components/icons'
import { UNIVERSE_CHAIN_LOGO } from 'uniswap/src/assets/chainLogos'
import { selectNftsVisibility } from 'uniswap/src/features/favorites/selectors'
import { toggleNftVisibility } from 'uniswap/src/features/favorites/slice'
import { WalletEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { WalletChainId } from 'uniswap/src/types/chains'
import { ONE_SECOND_MS } from 'utilities/src/time/time'
import { useWalletNavigation } from 'wallet/src/contexts/WalletNavigationContext'
import { getIsNftHidden, getNFTAssetKey } from 'wallet/src/features/nfts/utils'
import { pushNotification } from 'wallet/src/features/notifications/slice'
import { AppNotificationType } from 'wallet/src/features/notifications/types'
import { useAccounts } from 'wallet/src/features/wallet/hooks'
import { getExplorerName } from 'wallet/src/utils/linking'

interface NFTMenuParams {
  tokenId?: string
  contractAddress?: Address
  owner?: Address
  showNotification?: boolean
  isSpam?: boolean
  chainId?: WalletChainId
}

type MenuAction = ContextMenuAction & { onPress: () => void; Icon?: GeneratedIcon }

export function useNFTContextMenu({
  contractAddress,
  tokenId,
  owner,
  showNotification = false,
  isSpam,
  chainId,
}: NFTMenuParams): {
  menuActions: Array<MenuAction>
  onContextMenuPress: (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => void
  onlyShare: boolean
} {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const isDarkMode = useIsDarkMode()

  const { handleShareNft, navigateToNftDetails } = useWalletNavigation()

  const accounts = useAccounts()
  const isLocalAccount = owner && !!accounts[owner]

  const nftVisibility = useSelector(selectNftsVisibility)
  const nftKey = contractAddress && tokenId ? getNFTAssetKey(contractAddress, tokenId) : undefined
  const hidden = getIsNftHidden({ contractAddress, tokenId, isSpam, nftVisibility })

  const onPressShare = useCallback(async (): Promise<void> => {
    if (!contractAddress || !tokenId) {
      return
    }
    handleShareNft({ contractAddress, tokenId })
  }, [contractAddress, handleShareNft, tokenId])

  const onPressHiddenStatus = useCallback(() => {
    if (!nftKey) {
      return
    }

    sendAnalyticsEvent(WalletEventName.NFTVisibilityChanged, {
      tokenId,
      chainId,
      contractAddress,
      isSpam,
      // we log the state to which it's transitioning
      visible: hidden,
    })
    dispatch(toggleNftVisibility({ nftKey, isSpam }))

    if (showNotification) {
      dispatch(
        pushNotification({
          type: AppNotificationType.AssetVisibility,
          visible: !hidden,
          hideDelay: 2 * ONE_SECOND_MS,
          assetName: 'NFT',
        }),
      )
    }
  }, [nftKey, dispatch, isSpam, tokenId, chainId, contractAddress, hidden, showNotification])

  const onPressNavigateToExplorer = useCallback(() => {
    if (contractAddress && tokenId && chainId) {
      navigateToNftDetails({ address: contractAddress, tokenId, chainId })
    }
  }, [contractAddress, tokenId, chainId, navigateToNftDetails])

  const menuActions = useMemo(
    () =>
      nftKey
        ? [
            ...(isWeb && chainId
              ? [
                  {
                    title: t('tokens.nfts.action.viewOnExplorer', { blockExplorerName: getExplorerName(chainId) }),
                    onPress: onPressNavigateToExplorer,
                    Icon: isDarkMode
                      ? UNIVERSE_CHAIN_LOGO[chainId].explorer.logoDark
                      : UNIVERSE_CHAIN_LOGO[chainId].explorer.logoLight,
                    destructive: false,
                  },
                ]
              : []),
            ...(!isWeb
              ? [
                  {
                    title: t('common.button.share'),
                    systemIcon: 'square.and.arrow.up',
                    onPress: onPressShare,
                  },
                ]
              : []),
            ...((isLocalAccount && [
              {
                title: hidden ? t('tokens.nfts.hidden.action.unhide') : t('tokens.nfts.hidden.action.hide'),
                ...(isWeb
                  ? {
                      Icon: hidden ? Eye : EyeOff,
                    }
                  : {
                      systemIcon: hidden ? 'eye' : 'eye.slash',
                    }),
                destructive: !hidden,
                onPress: onPressHiddenStatus,
              },
            ]) ||
              []),
          ]
        : [],
    [
      nftKey,
      chainId,
      t,
      onPressNavigateToExplorer,
      isDarkMode,
      onPressShare,
      isLocalAccount,
      hidden,
      onPressHiddenStatus,
    ],
  )

  const onContextMenuPress = useCallback(
    async (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>): Promise<void> => {
      await menuActions[e.nativeEvent.index]?.onPress?.()
    },
    [menuActions],
  )

  return { menuActions, onContextMenuPress, onlyShare: !!nftKey && !isLocalAccount }
}

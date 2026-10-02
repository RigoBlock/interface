import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { logger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
import { POPUP_MEDIUM_DISMISS_MS } from '~/components/Popups/constants'
import { popupRegistry } from '~/state/popups/registry'
import { PopupType } from '~/state/popups/types'
import { getAuctionDetailsURL } from '~/utils/auctionDetailsUrl'

type AuctionDetailsNavigationInput = Parameters<typeof getAuctionDetailsURL>[0]

export function useNavigateToAuctionDetails(): (args: AuctionDetailsNavigationInput) => void {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return useEvent((args: AuctionDetailsNavigationInput) => {
    const url = getAuctionDetailsURL(args)
    if (url) {
      navigate(url)
      return
    }

    logger.warn('useNavigateToAuctionDetails', 'navigateToAuctionDetails', 'Cannot navigate to auction details', args)
    popupRegistry.addPopup(
      { type: PopupType.Error, error: t('notification.auction.open.failed') },
      'auction-navigation-error',
      POPUP_MEDIUM_DISMISS_MS,
    )
  })
}

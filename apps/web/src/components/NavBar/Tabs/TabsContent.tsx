import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Swap } from '@universe/mycelium/icons'
import { CoinConvert } from '@universe/mycelium/icons/CoinConvert'
import { Compass } from '@universe/mycelium/icons/Compass'
import { CreditCard } from '@universe/mycelium/icons/CreditCard'
import { Pools } from '@universe/mycelium/icons/Pools'
import { ReceiveAlt } from '@universe/mycelium/icons/ReceiveAlt'
import { Wallet } from '@universe/mycelium/icons/Wallet'
import { useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { MenuItem } from '~/components/NavBar/CompanyMenu/Content'
import { PageType } from '~/hooks/useIsPage'
import { ADD_LIQUIDITY_PATH } from '~/pages/AddLiquidity/poolLinkParams'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { buildPortfolioUrl } from '~/pages/Portfolio/utils/portfolioUrls'
import { useOperatedPoolAddresses } from '~/state/pool/hooks'
import { EntryPointKind, resolveEntryPoint } from '~/utils/createPositionEntryPoint'

export type TabsSection = {
  title: string
  href: string
  isActive?: boolean
  items?: TabsItem[]
  closeMenu?: () => void
  icon?: JSX.Element
  /** Small pill rendered next to the tab label (e.g. the Launches "Beta" tag). */
  badge?: JSX.Element
  elementName: ElementName
}

export type TabsItem = MenuItem & {
  icon?: JSX.Element
}

export const useTabsContent = (props?: { userIsOperator?: boolean }): TabsSection[] => {
  const { t } = useTranslation()
  const { pathname, search, state } = useLocation()
  const { chainId: portfolioChainId, isExternalWallet } = usePortfolioRoutes()
  const colors = useSporeColors()

  const isPortfolioDefiTabEnabled = useFeatureFlag(FeatureFlags.PortfolioDefiTab)
  const portfolioPoolsBalancesEnabled = useFeatureFlag(FeatureFlags.PortfolioPoolsBalances)
  const entryPoint = resolveEntryPoint({ search, state })
  const isPortfolioPoolsEntryPointActive = entryPoint.kind === EntryPointKind.PortfolioPools

  // The Pool tab leads to operator-only surfaces (positions/LP management), so it is hidden
  // unless the connected wallet operates at least one pool (disconnected wallets included).
  const operatedPoolAddresses = useOperatedPoolAddresses()

  return [
    {
      title: t('common.earn'),
      href: '/earn',
      isActive: pathname.startsWith('/earn') || pathname.startsWith('/mint') || pathname.startsWith('/stake'),
      icon: <Compass color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarExploreTab,
      items: [
        {
          label: t('common.earn'),
          href: '/earn',
          internal: true,
          elementName: ElementName.NavbarExploreTab,
        },
        {
          label: 'Manage',
          href: '/earn/manage',
          internal: true,
          elementName: ElementName.NavbarExploreTab,
        },
      ],
    },
    {
      title: t('common.trade'),
      href: '/swap',
      isActive: pathname.startsWith('/swap') /*|| pathname.startsWith('/limit')*/ || pathname.startsWith('/send'),
      icon: <CoinConvert color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarTradeTab,
      items: [
        ...(props?.userIsOperator
          ? [
              {
                label: t('common.swap'),
                icon: <Swap fill={colors.neutral2.val} />,
                href: '/swap',
                internal: true,
                elementName: ElementName.NavbarTradeDropdownSwap,
              },
            ]
          : []),
        //{
        //  label: t('swap.limit'),
        //  icon: <Limit fill={colors.neutral2.val} />,
        //  href: '/limit',
        //  internal: true,
        //  elementName: ElementName.NavbarTradeDropdownLimit,
        //},
        {
          label: t('common.buy.label'),
          icon: <CreditCard size="$icon.24" color="$neutral2" />,
          href: '/buy',
          internal: true,
          elementName: ElementName.NavbarTradeDropdownBuy,
        },
        {
          label: t('common.sell.label'),
          icon: <ReceiveAlt fill={colors.neutral2.val} size={24} transform="rotate(180deg)" />,
          href: '/sell',
          internal: true,
          elementName: ElementName.NavbarTradeDropdownSell,
        },
      ],
    },
    //{
    //  title: t('common.explore'),
    //  href: '/explore',
    //  isActive: pathname.startsWith('/explore') || pathname.startsWith('/nfts'),
    //  icon: <Compass color="$accent1" size="$icon.20" />,
    //  elementName: ElementName.NavbarExploreTab,
    //  items: [
    //    {
    //      label: t('common.tokens'),
    //      href: '/explore/tokens',
    //      internal: true,
    //      elementName: ElementName.NavbarExploreDropdownTokens,
    //    },
    //    {
    //      label: t('common.pools'),
    //      href: '/explore/pools',
    //      internal: true,
    //      elementName: ElementName.NavbarExploreDropdownPools,
    //    },
    //    {
    //      label: t('common.transactions'),
    //      href: '/explore/transactions',
    //      internal: true,
    //      elementName: ElementName.NavbarExploreDropdownTransactions,
    //    },
    //  ],
    //},
    ...(operatedPoolAddresses.size > 0
      ? [
          {
            title: t('common.pool'),
            href: '/positions',
            isActive:
              !isPortfolioPoolsEntryPointActive &&
              (pathname.startsWith('/positions') || pathname.startsWith('/liquidity')),
            icon: <Pools color="$accent1" size="$icon.24" />,
            elementName: ElementName.NavbarPoolTab,
            items: [
              {
                label: t('nav.tabs.viewPositions'),
                href: '/positions',
                internal: true,
                elementName: ElementName.NavbarPoolDropdownViewPositions,
              },
              {
                label: t('nav.tabs.createPosition'),
                href: ADD_LIQUIDITY_PATH,
                internal: true,
                elementName: ElementName.NavbarPoolDropdownCreatePosition,
              },
            ],
          },
        ]
      : []),
    {
      title: t('common.portfolio'),
      href: buildPortfolioUrl({
        tab: PortfolioTab.Overview,
        chainId: portfolioChainId,
      }),
      isActive: (pathname.startsWith(PageType.PORTFOLIO) && !isExternalWallet) || isPortfolioPoolsEntryPointActive,
      icon: <Wallet color="$accent1" size="$icon.24" />,
      elementName: ElementName.NavbarPortfolioTab,
      items: [
        {
          label: t('portfolio.overview.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Overview,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownOverview,
        },
        {
          label: t('common.token.plural'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Tokens,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownTokens,
        },
        {
          label: t('portfolio.staking.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Staking,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownStaking,
        },
        {
          label: t('portfolio.perps.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Perps,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownPerps,
        },
        ...(portfolioPoolsBalancesEnabled
          ? [
              {
                label: t('common.pools'),
                href: buildPortfolioUrl({
                  tab: PortfolioTab.Pools,
                  chainId: portfolioChainId,
                }),
                internal: true,
                elementName: ElementName.NavbarPortfolioDropdownPools,
              },
            ]
          : []),
        ...(isPortfolioDefiTabEnabled
          ? [
              {
                label: t('portfolio.defi.title'),
                href: buildPortfolioUrl({
                  tab: PortfolioTab.Defi,
                  chainId: portfolioChainId,
                }),
                internal: true,
                elementName: ElementName.NavbarPortfolioDropdownDefi,
              },
            ]
          : []),
        {
          label: t('portfolio.nfts.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Nfts,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownNfts,
        },
        {
          label: t('common.activity'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Activity,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownActivity,
        },
      ],
    },
  ]
}

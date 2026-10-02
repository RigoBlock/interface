import { RwaCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { cloneElement, type ReactElement } from 'react'
import { Trans } from 'react-i18next'
import { UniswapHelpUrls } from 'uniswap/src/constants/urls'

// Trans splices the mapped element into its children array, so it needs a key to avoid
// React's unique-key warning.
function keyedLink(element: ReactElement): ReactElement {
  return cloneElement(element, { key: 'link' })
}

/** Help-center article behind the disclaimer's "Learn more" link (Commodities has none, by design). */
export function getRwaDisclaimerHelpUrl(category: RwaCategory): string | undefined {
  switch (category) {
    case RwaCategory.STOCKS:
      return UniswapHelpUrls.articles.rwaExploreDisclaimer
    case RwaCategory.ETFS:
      return UniswapHelpUrls.articles.rwaExploreDisclaimerEtfs
    default:
      return undefined
  }
}

export function hasRwaDisclaimer(category: RwaCategory): boolean {
  return getRwaDisclaimerHelpUrl(category) !== undefined
}

/**
 * Disclaimer copy for RWA categories, shared by web and mobile — the caller supplies the
 * platform-appropriate "Learn more" link element for the given help-center href.
 *
 * The i18n keys must stay literal in the Trans elements: i18next-parser only sees static keys,
 * and these back the shipped Explore Stocks/ETFs disclaimers — a dynamic-key refactor silently
 * drops them from the catalog on the next `bun i18n:extract`.
 */
export function RwaDisclaimerText({
  category,
  renderLink,
}: {
  category: RwaCategory
  renderLink: (href: string) => ReactElement
}): JSX.Element | null {
  const href = getRwaDisclaimerHelpUrl(category)
  if (href === undefined) {
    return null
  }
  const link = keyedLink(renderLink(href))

  switch (category) {
    case RwaCategory.STOCKS:
      return <Trans i18nKey="explore.rwa.table.disclaimer.stocks" components={{ link }} />
    case RwaCategory.ETFS:
      return <Trans i18nKey="explore.rwa.table.disclaimer.etfs" components={{ link }} />
    default:
      return null
  }
}

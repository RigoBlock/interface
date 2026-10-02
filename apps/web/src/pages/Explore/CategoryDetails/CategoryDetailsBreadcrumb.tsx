import { Text } from '@universe/mycelium'
import { RotatableChevron } from '@universe/mycelium/icons/RotatableChevron'
import { useTranslation } from 'react-i18next'
import { BreadcrumbNavContainer, BreadcrumbNavLink } from '~/components/BreadcrumbNav'
import { getExploreTokensURL } from '~/pages/Explore/categories/useExploreCategory'

export function CategoryDetailsBreadcrumb({ categoryName }: { categoryName?: string }): JSX.Element {
  const { t } = useTranslation()

  return (
    <BreadcrumbNavContainer aria-label="breadcrumb-nav" mb="$none">
      <BreadcrumbNavLink to={getExploreTokensURL()}>
        {t('common.token.plural')}
        <RotatableChevron direction="right" size="$icon.16" />
      </BreadcrumbNavLink>
      {categoryName && (
        <Text variant="body2" color="$neutral1" aria-current="page">
          {categoryName}
        </Text>
      )}
    </BreadcrumbNavContainer>
  )
}

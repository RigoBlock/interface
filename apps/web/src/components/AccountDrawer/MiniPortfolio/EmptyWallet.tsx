import { Trans, t } from 'i18n'
import { useCallback, useMemo } from 'react'
import styled from 'styled-components'
import { Flex, Text, useIsDarkMode } from 'ui/src'
import { CRYPTO_PURCHASE_BACKGROUND_DARK, CRYPTO_PURCHASE_BACKGROUND_LIGHT } from 'ui/src/assets'
import { ArrowDownCircle, Buy as BuyIcon } from 'ui/src/components/icons'
import { ActionCard, ActionCardItem } from 'uniswap/src/components/misc/ActionCard'
import { ElementName } from 'uniswap/src/features/telemetry/constants'

export const EmptyWallet = ({
  handleBuyCryptoClick,
  handleReceiveCryptoClick,
}: {
  handleBuyCryptoClick: () => void
  handleReceiveCryptoClick: () => void
}) => {
  const isDarkMode = useIsDarkMode()

  const BackgroundImageWrapperCallback = useCallback(
    ({ children }: { children: React.ReactNode }) => {
      return (
        <BackgroundImage image={isDarkMode ? CRYPTO_PURCHASE_BACKGROUND_DARK : CRYPTO_PURCHASE_BACKGROUND_LIGHT}>
          {children}
        </BackgroundImage>
      )
    },
    [isDarkMode],
  )

  const options: ActionCardItem[] = useMemo(
    () => [
      {
        title: t('home.tokens.empty.action.buy.title'),
        blurb: t('home.tokens.empty.action.buy.description'),
        elementName: ElementName.EmptyStateBuy,
        icon: <BuyIcon color="$accent1" size="$icon.28" />,
        onPress: handleBuyCryptoClick,
        BackgroundImageWrapperCallback,
      },
      {
        title: t('home.tokens.empty.action.receive.title'),
        blurb: t('home.tokens.empty.action.receive.description'),
        elementName: ElementName.EmptyStateReceive,
        icon: <ArrowDownCircle color="$accent1" size="$icon.28" />,
        onPress: handleReceiveCryptoClick,
      },
    ],
    [BackgroundImageWrapperCallback, handleBuyCryptoClick, handleReceiveCryptoClick],
  )

  return (
    <Flex py={20} gap="$spacing20">
      <Flex gap="$spacing8">
        <Text variant="buttonLabel3" color="$neutral1">
          <Trans i18nKey="home.tokens.empty.welcome" />
        </Text>
        <Text variant="body3" color="$neutral2">
          <Trans i18nKey="home.tokens.empty.welcome.description" />
        </Text>
      </Flex>
      <Flex gap="$spacing12">
        {options.map((option) => (
          <ActionCard key={option.title} {...option} />
        ))}
      </Flex>
    </Flex>
  )
}

const StyledBackgroundImage = styled.img`
  width: 100%;
  border-radius: 24px;
  position: absolute;
  z-index: -1;
  height: 100%;
  object-fit: cover;
  filter: blur(2px);
`

const BackgroundImage = ({ children, image }: { children: React.ReactNode; image: string }): JSX.Element => {
  return (
    <Flex>
      <StyledBackgroundImage src={image} />
      {children}
    </Flex>
  )
}

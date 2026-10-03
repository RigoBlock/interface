import { Button, type ButtonProps, Flex, type FlexCompatProps, Text } from '@universe/mycelium'
import { Droplet } from '@universe/mycelium/icons/Droplet'
import { Plus } from '@universe/mycelium/icons/Plus'
import { useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { heights } from '@universe/mycelium/tokens'
import { useTranslation } from 'react-i18next'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { ADD_LIQUIDITY_PATH, CREATE_POOL_PATH } from '~/pages/AddLiquidity/poolLinkParams'
import { MAX_CONTENT_WIDTH_PX } from '~/theme'
import { createDottedBackgroundStyles } from '~/utils/createDottedBackgroundStyles'

const fillAbsolute: FlexCompatProps = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }

const dotsFadeMask = 'linear-gradient(to bottom, black 0%, transparent 80%)'

const linkButtonProps: ButtonProps = {
  tag: 'a',
  variant: 'branded',
  size: 'medium',
  fill: false,
  '$platform-web': { textDecoration: 'none' },
}

export function PositionsHeroHeader() {
  const { t } = useTranslation()
  const colors = useSporeColors()

  const { dottedBackgroundStyle } = createDottedBackgroundStyles({ dotColor: colors.neutral1.val, dotOpacity: 12 })

  return (
    <Flex minWidth="100vw" mt={-heights['interface-nav']} position="relative" overflow="hidden" alignItems="center">
      <Flex
        {...fillAbsolute}
        style={{ ...dottedBackgroundStyle, maskImage: dotsFadeMask, WebkitMaskImage: dotsFadeMask }}
      />
      <Flex
        width="100%"
        maxWidth={MAX_CONTENT_WIDTH_PX}
        zIndex={1}
        pt={heights['interface-nav']}
        px="$spacing40"
        $lg={{ px: '$spacing20' }}
      >
        <Flex gap="$spacing36" py="$spacing32" $md={{ alignItems: 'center' }}>
          <Flex gap="$spacing8" maxWidth={480} $md={{ alignItems: 'center' }}>
            <Text variant="heading2" color="$neutral1" $md={{ textAlign: 'center' }}>
              {t('pool.hero.title')}
            </Text>
            <Text variant="subheading1" color="$neutral2" $md={{ textAlign: 'center' }}>
              {t('pool.hero.subtitle')}
            </Text>
          </Flex>
          <Flex row gap="$spacing8" flexWrap="wrap" $md={{ justifyContent: 'center' }}>
            <Trace logPress element={ElementName.CreatePositionButton}>
              <Button {...linkButtonProps} emphasis="primary" href={ADD_LIQUIDITY_PATH} icon={<Droplet />}>
                {t('common.createPosition')}
              </Button>
            </Trace>
            <Trace logPress element={ElementName.CreatePoolButton}>
              <Button {...linkButtonProps} emphasis="secondary" href={CREATE_POOL_PATH} icon={<Plus />}>
                {t('addLiquidity.createPool')}
              </Button>
            </Trace>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  )
}

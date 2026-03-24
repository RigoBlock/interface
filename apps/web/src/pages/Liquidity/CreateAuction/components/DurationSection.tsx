import type { CSSProperties } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea } from 'ui/src'
import { Minus } from 'ui/src/components/icons/Minus'
import { Plus } from 'ui/src/components/icons/Plus'
import {
  FORMAT_DATE_TIME_MEDIUM,
  useFormattedDateTime,
  useLocalizedDayjs,
} from 'uniswap/src/features/language/localizedDayjs'

const DATETIME_INPUT_CLASS = 'DurationSection-datetimeInput'

const DATETIME_INPUT_CSS = `
  .${DATETIME_INPUT_CLASS} {
    caret-color: transparent;
    outline: none;
  }
  .${DATETIME_INPUT_CLASS}::-webkit-calendar-picker-indicator {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    cursor: pointer;
    opacity: 0;
  }
  .${DATETIME_INPUT_CLASS}::-webkit-datetime-edit {
    display: none;
  }
`

const DATETIME_INPUT_OVERLAY_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  background: 'transparent',
  border: 'none',
  color: 'transparent',
  cursor: 'pointer',
  padding: 0,
  margin: 0,
  zIndex: 1,
}

function toDatetimeLocalValue(date: Date | undefined): string {
  if (!date) {
    return ''
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function DurationSection({
  maxDurationDays,
  startTime,
  onStartTimeChange,
  onDecrement,
  onIncrement,
}: {
  maxDurationDays: number
  startTime: Date | undefined
  onStartTimeChange: (date: Date | undefined) => void
  onDecrement: () => void
  onIncrement: () => void
}) {
  const { t } = useTranslation()
  const dayjsInstance = useLocalizedDayjs()
  const formattedStartTime = useFormattedDateTime(dayjsInstance(startTime), FORMAT_DATE_TIME_MEDIUM)

  const handleDatetimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      if (!value) {
        onStartTimeChange(undefined)
        return
      }
      onStartTimeChange(new Date(value))
    },
    [onStartTimeChange],
  )

  return (
    <Flex gap="$spacing12">
      <Flex gap="$spacing4">
        <Text variant="subheading1" color="$neutral1">
          {t('toucan.createAuction.step.configureAuction.duration')}
        </Text>
        <Text variant="body3" color="$neutral2">
          {t('toucan.createAuction.step.configureAuction.duration.description')}
        </Text>
      </Flex>
      <Flex row gap="$spacing12">
        <Flex
          flex={1}
          flexBasis={0}
          position="relative"
          flexDirection="column"
          backgroundColor="$surface2"
          borderRadius="$rounded16"
          p="$spacing16"
          gap="$spacing4"
          minHeight={72}
        >
          <Text variant="body3" color="$neutral2">
            {t('toucan.createAuction.step.configureAuction.duration.startTime')}
          </Text>
          <Flex position="relative" minHeight={28}>
            <style>{DATETIME_INPUT_CSS}</style>
            <Text variant="subheading1" color={startTime ? '$neutral1' : '$neutral3'} pointerEvents="none">
              {startTime
                ? formattedStartTime
                : t('toucan.createAuction.step.configureAuction.duration.startTimePlaceholder')}
            </Text>
            <input
              type="datetime-local"
              className={DATETIME_INPUT_CLASS}
              value={toDatetimeLocalValue(startTime)}
              onChange={handleDatetimeChange}
              style={DATETIME_INPUT_OVERLAY_STYLE}
              aria-label={t('toucan.createAuction.step.configureAuction.duration.startTime')}
              title={t('toucan.createAuction.step.configureAuction.duration.startTimePlaceholder')}
            />
          </Flex>
        </Flex>
        <Flex
          flex={1}
          flexBasis={0}
          backgroundColor="$surface2"
          borderRadius="$rounded16"
          p="$spacing16"
          gap="$spacing4"
        >
          <Text flex={1} variant="body3" color="$neutral2">
            {t('toucan.createAuction.step.configureAuction.duration.maxDuration')}
          </Text>
          <Flex row alignItems="center" justifyContent="space-between" flex={1} userSelect="none">
            <Text variant="subheading1" color="$neutral1">
              {t('common.day.count', { count: maxDurationDays })}
            </Text>
            <Flex row gap="$spacing8">
              <TouchableArea
                borderWidth="$spacing1"
                borderColor="$surface3"
                borderRadius="$roundedFull"
                p="$spacing6"
                onPress={onDecrement}
              >
                <Minus size="$icon.16" color="$neutral1" />
              </TouchableArea>
              <TouchableArea
                borderWidth="$spacing1"
                borderColor="$surface3"
                borderRadius="$roundedFull"
                p="$spacing6"
                onPress={onIncrement}
              >
                <Plus size="$icon.16" color="$neutral1" />
              </TouchableArea>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  )
}

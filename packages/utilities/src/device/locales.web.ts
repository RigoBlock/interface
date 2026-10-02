import { getChrome } from '@universe/environment'
import { DEFAULT_LANGUAGE_CODE, DEFAULT_LANGUAGE_TAG, DeviceLocale } from 'utilities/src/device/constants'
import { logger } from 'utilities/src/logger/logger'

export function getDeviceLocales(): DeviceLocale[] {
  try {
    const chrome = getChrome()
    // `chrome.i18n` and `getUILanguage` are always defined when the `chrome` global exists.
    const language = chrome?.i18n.getUILanguage()
    if (language) {
      return [{ languageCode: language, languageTag: language }]
    }
    // Fall back to navigator.language for web context
    if (typeof navigator !== 'undefined' && navigator.language) {
      return [{ languageCode: navigator.language, languageTag: navigator.language }]
    }
  } catch (e) {
    logger.error(e, {
      level: 'warn',
      tags: { file: 'utils.ts', function: 'getDeviceLocales' },
    })
  }
  return [
    {
      languageCode: DEFAULT_LANGUAGE_CODE,
      languageTag: DEFAULT_LANGUAGE_TAG,
    },
  ]
}

import 'utilities/src/logger/mocks'

import { chrome } from 'jest-chrome'
import { AppearanceSettingType } from 'wallet/src/features/appearance/slice'
import { TextEncoder, TextDecoder } from 'util'
import { mockSharedPersistQueryClientProvider } from 'uniswap/src/test/mocks/mockSharedPersistQueryClientProvider'
import { mockUIAssets } from 'ui/src/test/mocks/mockUIAssets'

process.env.IS_UNISWAP_EXTENSION = true

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const ignoreLogs = {
  error: [
    // We need to use _persist property to ensure that the state is properly
    // rehydrated (https://github.com/Uniswap/universe/pull/7502/files#r1566259088)
    'Unexpected key "_persist" found in previous state received by the reducer.'
  ]
}

// Ignore certain logs that are expected during tests.
Object.entries(ignoreLogs).forEach(([method, messages]) => {
  const key = method
  const originalMethod = console[key]
  console[key] = ((...args) => {
    if (messages.some((message) => args.some((arg) => typeof arg === 'string' && arg.startsWith(message)))) {
      return
    }
    originalMethod(...args)
  })
})

globalThis.matchMedia =
  globalThis.matchMedia ||
  ((query) => {
    const reducedMotion = query.match(/prefers-reduced-motion: ([a-zA-Z0-9-]+)/)

    return {
      // Needed for reanimated to disable reduced motion warning in tests
      matches: reducedMotion ? reducedMotion[1] === 'no-preference' : false,
      addListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }
  })

require('react-native-reanimated').setUpTests()

global.chrome = chrome

jest.mock('src/app/navigation/utils', () => ({
  useExtensionNavigation: () => ({
    navigateTo: jest.fn(),
    navigateBack: jest.fn(),
  })
}))

jest.mock('wallet/src/features/focus/useIsFocused', () => {
  return jest.fn().mockReturnValue(true)
})

const mockAppearanceSetting = AppearanceSettingType.System
jest.mock('wallet/src/features/appearance/hooks', () => {
  return {
    useCurrentAppearanceSetting: () => mockAppearanceSetting,
  }
})
jest.mock('wallet/src/features/appearance/hooks', () => {
  return {
    useSelectedColorScheme: () => 'light',
  }
})

jest.mock('uniswap/src/data/apiClients/SharedPersistQueryClientProvider', () => mockSharedPersistQueryClientProvider)

mockUIAssets()

/* oxlint-disable typescript/no-unnecessary-condition */
import { Buffer } from 'buffer'

declare global {
  interface Window {
    Buffer: typeof Buffer
  }
}

// react-native's global typings declare a global `const __DEV__`; augment Window via a local
// cast instead of an interface merge to avoid duplicate-declaration clashes with it.
if (!(window as { __DEV__?: boolean }).__DEV__) {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax
  ;(window as { __DEV__?: boolean }).__DEV__ = process.env.NODE_ENV === 'development'
}

if (!window.Buffer) {
  window.Buffer = Buffer
}

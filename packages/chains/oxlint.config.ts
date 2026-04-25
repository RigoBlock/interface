import { defineConfig } from 'oxlint'
import rootConfig, { rootIgnorePatterns } from '../../oxlint.config.ts'

export default defineConfig({
  extends: [rootConfig],
  ignorePatterns: rootIgnorePatterns,
})

/* oxlint-disable max-params */
import { minVersionBump, TokenList, VersionUpgrade } from '@uniswap/token-lists'
import { logger } from 'utilities/src/logger/logger'

export function shouldAcceptVersionUpdate(
  listUrl: string,
  current: TokenList,
  update: TokenList,
  targetBump: VersionUpgrade.PATCH | VersionUpgrade.MINOR,
): boolean {
  const min = minVersionBump(current.tokens, update.tokens)
  // Automatically update minor/patch as long as bump matches the min update.
  if (targetBump >= min) {
    return true
  } else {
    logger.debug(
      'lists/poolsList/utils',
      'shouldAcceptVersionUpdate',
      `List at url ${listUrl} could not automatically update because the version bump was only PATCH/MINOR while the update had breaking changes and should have been MAJOR`,
    )
    return false
  }
}

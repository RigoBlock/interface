import { logger } from 'utilities/src/logger/logger'

export async function openSidePanel(tabId: number | undefined, windowId: number): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await chrome.sidePanel.open({
      tabId,
      windowId,
    })
  } catch (error) {
    logger.error(error, {
      tags: {
        file: 'background/background.ts',
        function: 'openSidebar',
      },
    })
  }
}

export async function setSidePanelBehavior(behavior: chrome.sidePanel.PanelBehavior): Promise<void> {
  try {
    await chrome.sidePanel.setPanelBehavior(behavior)
  } catch (error) {
    logger.error(error, {
      tags: {
        file: 'background/background.ts',
        function: 'setSideBarBehavior',
      },
    })
  }
}

export async function setSidePanelOptions(options: chrome.sidePanel.PanelOptions): Promise<void> {
  try {
    await chrome.sidePanel.setOptions(options)
  } catch (error) {
    logger.error(error, {
      tags: {
        file: 'background/background.ts',
        function: 'setSideBarOptions',
      },
    })
  }
}

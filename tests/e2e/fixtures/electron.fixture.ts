import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, test as base } from '@playwright/test'

/**
 * Custom fixtures for Electron e2e testing.
 * Provides electronApp and mainWindow to all tests.
 */
export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    // Launch Electron app from project root
    // The args ['.'] tells Electron to load the app from current directory
    const electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      },
      timeout: 60000
    })

    await use(electronApp)

    // Cleanup: close the app after test
    await electronApp.close()
  },

  mainWindow: async ({ electronApp }, use) => {
    // Identify the main window by the document it loads rather than its title: the
    // title carries the product name, and other windows (Quick Assistant, sub
    // window) would otherwise be indistinguishable.
    const mainWindow = await electronApp.waitForEvent('window', {
      predicate: (window) => window.url().includes('windows/main/index.html'),
      timeout: 60000
    })

    // Wait for React app to mount
    await mainWindow.waitForSelector('#root', { state: 'attached', timeout: 60000 })

    // Wait for initial content to load
    await mainWindow.waitForLoadState('domcontentloaded')

    await use(mainWindow)
  }
})

export { expect } from '@playwright/test'

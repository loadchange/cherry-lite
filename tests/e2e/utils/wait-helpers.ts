import type { Page } from '@playwright/test'

/**
 * Wait for the application to be fully ready.
 * First launch lands on onboarding; later launches open chat. This helper
 * only asserts that React has mounted into `#root`.
 */
export async function waitForAppReady(page: Page, timeout: number = 60000): Promise<void> {
  await page.waitForSelector('#root', { state: 'attached', timeout })

  await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, {
    timeout
  })

  await page.waitForLoadState('domcontentloaded')
}

import type { Page } from '@playwright/test'

/**
 * Wait for the application to be fully ready.
 * Which screen renders first depends on state this helper does not control — a
 * fresh profile lands on onboarding, an existing one on chat — so it asserts
 * only that React has mounted.
 */
export async function waitForAppReady(page: Page, timeout: number = 60000): Promise<void> {
  // First, wait for React root to be attached
  await page.waitForSelector('#root', { state: 'attached', timeout })

  // Then wait for React to render into it.
  await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, {
    timeout
  })

  // Additional wait for React to fully hydrate
  await page.waitForLoadState('domcontentloaded')
}

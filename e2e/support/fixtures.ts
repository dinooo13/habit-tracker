import { test as base, expect, type Page } from '@playwright/test'
import type { AppData } from '../../app/types/app-data'
import { authenticate, seedData } from './seed'

interface Fixtures {
  /** A page with the dummy-auth flag set before the app boots. */
  authedPage: Page
  /**
   * Seeds IndexedDB with `data` and reloads so the bootstrap plugin hydrates
   * the stores. The page must already be on an app-origin URL — call
   * `authedPage.goto(...)` first.
   */
  seed: (data: AppData) => Promise<void>
}

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await authenticate(page)
    await use(page)
  },

  seed: async ({ page }, use) => {
    await use((data: AppData) => seedData(page, data))
  }
})

export { expect }

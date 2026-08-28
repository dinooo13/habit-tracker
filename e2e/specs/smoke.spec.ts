import { test, expect } from '../support/fixtures'
import { buildStreakData } from '../support/data'

test.describe('App shell smoke', () => {
  // Tagged `@production`: these run in the normal `e2e` job AND are selected by
  // the post-deploy `production-smoke` job (`--grep @production`, ADR-0020). The
  // fixtures are origin-agnostic, so they drive the live origin unchanged.
  test('authenticated dashboard renders the habit queue shell', { tag: '@production' }, async ({ authedPage: page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('heading', { name: 'Today\'s habit queue' })).toBeVisible()
  })

  test('seeded data hydrates into the dashboard', { tag: '@production' }, async ({ authedPage: page, seed }) => {
    await seed(buildStreakData(5, { name: 'Morning run' }))
    await page.goto('/app')

    await expect(page.locator('.queue-card').filter({ hasText: 'Morning run' })).toBeVisible()
  })

  // A deep route + hard reload exercises the `.htaccess` SPA fallback and the
  // deploy base path (the difference local E2E otherwise avoids), while watching
  // for runtime console errors and failed same-origin requests — this is where
  // manifest/icon/chunk request health is asserted at runtime against the live
  // build. Shared (not a parallel prod-only spec) so it also guards PR CI.
  test('a deep link survives a hard reload with no console errors or failed requests', { tag: '@production' }, async ({ authedPage: page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const rawFailures: string[] = []

    // Known-benign console noise: service-worker / PWA registration and the Vue
    // Devtools hint are expected; everything else counts as a real error.
    const isBenign = (text: string): boolean =>
      /service ?worker|workbox|\[vite\]|devtools/i.test(text)

    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenign(msg.text())) {
        consoleErrors.push(msg.text())
      }
    })
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? ''
      // Ignore requests aborted by navigation/reload — not a real failure.
      if (!/ERR_ABORTED/i.test(failure)) {
        rawFailures.push(`${failure} ${request.url()}`)
      }
    })
    page.on('response', (response) => {
      if (response.status() >= 400) {
        rawFailures.push(`${response.status()} ${response.url()}`)
      }
    })

    await page.goto('/app/insights')
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible()

    // Hard reload of the deep route: the SPA-fallback + base path must still boot
    // the app and re-render the shell.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible()

    // Only same-origin failures gate the run — a third-party font/analytics blip
    // must not fail a production smoke check.
    const origin = new URL(page.url()).origin
    const failedRequests = rawFailures.filter(entry => entry.includes(origin))

    expect(pageErrors, `unexpected page errors: ${pageErrors.join('; ')}`).toEqual([])
    expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([])
    expect(failedRequests, `failed same-origin requests: ${failedRequests.join('; ')}`).toEqual([])
  })
})

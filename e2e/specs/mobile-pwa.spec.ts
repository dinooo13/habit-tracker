import { test, expect } from '../support/fixtures'
import { appRoutePattern } from '../support/url'

test.describe('PWA / shell', () => {
  test('the app shell loads and PWA assets are served', { tag: '@production' }, async ({ authedPage: page }) => {
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Today\'s habit queue' })).toBeVisible()

    // The PWA manifest is generated and served by the preview build. (With SSR
    // disabled the <link> is injected client-side, so fetch the endpoint.)
    const manifestResponse = await page.request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = await manifestResponse.json()
    expect(manifest.name).toBe('Atomic Habit Tracker')

    // The service worker script is emitted in the production/preview build.
    const swResponse = await page.request.get('/sw.js')
    expect(swResponse.ok()).toBeTruthy()
  })
})

test.describe('Mobile bottom navigation', () => {
  // Only meaningful on the mobile viewport project, where MobileBottomNav is shown.
  test.skip(({ viewport }) => !viewport || viewport.width >= 768, 'mobile viewport only')

  test('the bottom nav switches between primary sections', { tag: '@production' }, async ({ authedPage: page }) => {
    await page.goto('/app')

    const bottomNav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(bottomNav).toBeVisible()

    await bottomNav.getByRole('link', { name: 'Habits' }).click()
    await expect(page).toHaveURL(appRoutePattern('/app/habits'))

    await bottomNav.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(appRoutePattern('/app/settings'))

    await bottomNav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(appRoutePattern('/app'))
  })
})

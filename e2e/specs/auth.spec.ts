import { test, expect } from '../support/fixtures'
import { authenticate } from '../support/seed'

test.describe('Auth & routing', () => {
  test('unauthenticated visit to a protected route redirects to login with redirect param', async ({ page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)app/)
    await expect(page.getByRole('heading', { name: 'Continue to Atomic Habit Tracker' })).toBeVisible()
  })

  test('demo login lands on the intended target', async ({ page }) => {
    await page.goto('/app/habits')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    // Wait for the login view to mount/hydrate before clicking, so the click
    // isn't dropped mid-redirect in the SSR-disabled SPA.
    await expect(page.getByRole('heading', { name: 'Continue to Atomic Habit Tracker' })).toBeVisible()

    await page.getByRole('button', { name: 'Continue with demo login' }).click()

    await expect(page).toHaveURL(/\/app\/habits$/)
    await expect(page.getByRole('heading', { name: 'Habits', exact: true })).toBeVisible()
  })

  test('visiting /login while authenticated redirects into the app', async ({ page }) => {
    await authenticate(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/app$/)
  })

  test('legacy paths redirect to their /app equivalents', async ({ page }) => {
    await authenticate(page)
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/app\/settings$/)

    await page.goto('/habits')
    await expect(page).toHaveURL(/\/app\/habits$/)
  })

  test('logout returns to the landing page and re-gates protected routes', async ({ page }) => {
    // Log in through the UI (not the persistent init-script helper) so logout
    // truly clears auth and the re-gate can be observed.
    await page.goto('/login')
    await page.getByRole('button', { name: 'Continue with demo login' }).click()
    await expect(page).toHaveURL(/\/app$/)

    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/app')
    await expect(page).toHaveURL(/\/login/)
  })
})

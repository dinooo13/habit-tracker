import { test, expect } from '../support/fixtures'
import { buildStreakData } from '../support/data'

test.describe('App shell smoke', () => {
  test('authenticated dashboard renders the habit queue shell', async ({ authedPage: page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('heading', { name: "Today's habit queue" })).toBeVisible()
  })

  test('seeded data hydrates into the dashboard', async ({ authedPage: page, seed }) => {
    await seed(buildStreakData(5, { name: 'Morning run' }))
    await page.goto('/app')

    await expect(page.locator('.queue-card').filter({ hasText: 'Morning run' })).toBeVisible()
  })
})

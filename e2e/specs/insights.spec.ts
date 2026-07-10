import { test, expect } from '../support/fixtures'
import { buildStreakData } from '../support/data'

test.describe('Insights', () => {
  test('renders completion and performance sections for seeded history', async ({ authedPage: page, seed }) => {
    // 7-day streak builder → 6 of the last 7 due days are done (today is still open).
    await seed(buildStreakData(7, { name: 'Daily pushups' }))
    await page.goto('/app/insights')

    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Completion trend' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Habit performance' })).toBeVisible()
    // The seeded history yields a non-zero completion rate.
    await expect(page.getByText(/\b\d+%/).first()).toBeVisible()
  })

  test('shows the page with a zero state when there is no history', async ({ authedPage: page }) => {
    await page.goto('/app/insights')
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Completion trend' })).toBeVisible()
  })
})

async function primaryColor500(page: import('@playwright/test').Page): Promise<string> {
  return (
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-color-primary-500').trim(),
    )
  )
}

test.describe('Settings: theme & appearance', () => {
  test('changing the accent color applies and persists across a reload', async ({ authedPage: page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Default accent is Emerald.
    expect(await primaryColor500(page)).toBe('#10b981')

    // The accent color is the second combobox on the page (after "Week starts on").
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'Rose' }).click()

    // The palette CSS variable updates live.
    await expect.poll(() => primaryColor500(page)).not.toBe('#10b981')
    const rose = await primaryColor500(page)

    // Flush the debounced save, then reload — the accent persists.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await expect.poll(() => primaryColor500(page)).toBe(rose)
  })
})

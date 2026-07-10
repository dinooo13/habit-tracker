import { test, expect } from '../support/fixtures'
import { DashboardPage } from '../support/pages/dashboard'
import { addDaysKey, makeAppData, makeHabit, todayKey } from '../support/data'

test.describe('Pause mode', () => {
  test('a habit paused over today is badged and kept out of the queue', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({
      name: 'Daily journal',
      scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
      startDate: addDaysKey(todayKey(), -10),
      pauses: [{ start: addDaysKey(todayKey(), -2), end: addDaysKey(todayKey(), 2) }],
    })
    await seed(makeAppData({ habits: [habit] }))

    await page.goto('/app/habits')
    const card = page.locator('.habit-card').filter({ hasText: 'Daily journal' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Paused')

    // Not due today → absent from the dashboard queue, with a paused indicator.
    const dash = new DashboardPage(page)
    await page.getByRole('link', { name: 'Today' }).click()
    await expect(dash.card('Daily journal')).toHaveCount(0)
    await expect(page.getByText(/paused/i).first()).toBeVisible()
  })

  test('the pause editor round-trips a range through create', async ({ authedPage: page }) => {
    await page.goto('/app/habits/new')

    await page.getByLabel('Habit name').fill('Read 10 pages')
    await page.getByLabel('Identity statement').fill('I am a daily learner.')

    // Add a pause row and fill its dates.
    await page.getByRole('button', { name: 'Add pause' }).click()
    const start = addDaysKey(todayKey(), 3)
    const end = addDaysKey(todayKey(), 9)
    const dateInputs = page.locator('input[type="date"]')
    // [0] = start date field, [1] = pause "From", [2] = pause "To"
    await dateInputs.nth(1).fill(start)
    await dateInputs.nth(2).fill(end)

    await page.getByRole('button', { name: 'Create habit' }).click()
    await expect(page).toHaveURL(/\/app\/habits$/)

    const card = page.locator('.habit-card').filter({ hasText: 'Read 10 pages' })
    await expect(card).toBeVisible()
    // Not currently paused (the range is in the future), so the count badge shows.
    await expect(card).toContainText(/pause/i)
  })
})

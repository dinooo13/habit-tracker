import { test, expect } from '../support/fixtures'
import { DashboardPage } from '../support/pages/dashboard'
import { addDaysKey, makeAppData, makeHabit, todayKey } from '../support/data'

// A habit that is due every day, with no entries yet — always "open" today.
function dailyHabit(name: string) {
  return makeHabit({
    name,
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: addDaysKey(todayKey(), -3),
    reminderTime: null,
  })
}

test.describe('Dashboard queue', () => {
  test('marking done moves a card from Open to Reviewed and updates counts', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [dailyHabit('Drink water')] }))
    await page.goto('/app')
    const dash = new DashboardPage(page)

    await expect(dash.card('Drink water')).toBeVisible()
    await expect(dash.progressText()).toContainText('0 of 1 reviewed')

    await dash.markDone('Drink water')

    await expect(page.getByText('Nice work').first()).toBeVisible()
    await expect(dash.progressText()).toContainText('1 of 1 reviewed')
    await expect(page.getByText('Done: 1')).toBeVisible()

    // The Open tab no longer lists it.
    await dash.openTab()
    await expect(page.getByText('No open habits')).toBeVisible()

    // It now appears under Reviewed with a Done status.
    await dash.reviewedTab()
    await expect(dash.card('Drink water')).toContainText('Done')
  })

  test('missed habit raises the reflection alert', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [dailyHabit('Floss')] }))
    await page.goto('/app')
    const dash = new DashboardPage(page)

    await dash.markMissed('Floss')

    await expect(page.getByText('Missed: 1')).toBeVisible()
    await expect(page.getByText(/needs reflection|need reflection/)).toBeVisible()
  })

  test('reopen returns a reviewed card to Open', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [dailyHabit('Stretch')] }))
    await page.goto('/app')
    const dash = new DashboardPage(page)

    await dash.markSkipped('Stretch')
    await expect(page.getByText('Skipped: 1')).toBeVisible()

    await dash.reviewedTab()
    await dash.reopen('Stretch')
    await expect(page.getByText('Moved back to open').first()).toBeVisible()
    await expect(dash.progressText()).toContainText('0 of 1 reviewed')
  })

  test('empty state invites creating a habit when nothing is due', async ({ authedPage: page }) => {
    await page.goto('/app')
    await expect(page.getByText('No habits due today')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create habit' })).toBeVisible()
  })

  test('date navigation moves to the previous day and back to today', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [dailyHabit('Journal')] }))
    await page.goto('/app')
    const dash = new DashboardPage(page)

    await expect(dash.card('Journal')).toBeVisible()

    await dash.previousDay()
    await expect(page.getByText('Viewing a past day')).toBeVisible()
    // Cannot navigate past today: the Next button is enabled on a past day.
    await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()

    await dash.backToToday()
    await expect(page.getByText('Viewing a past day')).toHaveCount(0)
  })

  test('future days are unreachable (Next disabled on today)', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [dailyHabit('Walk')] }))
    await page.goto('/app')
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })
})

import { test, expect } from '../support/fixtures'
import { DashboardPage } from '../support/pages/dashboard'
import { HabitFormPage } from '../support/pages/habit-form'
import { readPersistedStore } from '../support/seed'
import { addDaysKey, makeAppData, makeHabit, todayKey } from '../support/data'
import { appRoutePattern } from '../support/url'

async function flushSave(page: import('@playwright/test').Page): Promise<void> {
  // The bootstrap plugin flushes its debounced save on visibilitychange → hidden.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

test.describe('Persistence', () => {
  test('a habit created via the UI survives a full reload (IndexedDB)', async ({ authedPage: page }) => {
    const form = new HabitFormPage(page)
    await form.gotoNew()
    await form.fill({
      name: 'Persistent habit',
      identityStatement: 'I am consistent over time.',
      startDate: addDaysKey(todayKey(), -1),
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    })
    await form.submit()
    await expect(page.locator('.habit-card').filter({ hasText: 'Persistent habit' })).toBeVisible()

    await flushSave(page)
    await expect
      .poll(async () => (await readPersistedStore<{ name: string }>(page, 'habits')).some(h => h.name === 'Persistent habit'))
      .toBe(true)
    await page.reload()
    await expect(page.locator('.habit-card').filter({ hasText: 'Persistent habit' })).toBeVisible()
  })

  // Tagged `@production` (ADR-0020): also selected by the post-deploy smoke job
  // as the "seeded data survives a hard reload" check against the live origin.
  test('seeded status changes survive a reload', { tag: '@production' }, async ({ authedPage: page, seed }) => {
    const habit = makeHabit({
      name: 'Daily greens',
      scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
      startDate: addDaysKey(todayKey(), -2),
    })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app')

    const dash = new DashboardPage(page)
    await dash.markDone('Daily greens')
    await expect(page.getByText('Done: 1')).toBeVisible()

    await flushSave(page)
    // Wait until the "done" status has actually been written before reloading.
    await expect
      .poll(async () =>
        (await readPersistedStore<{ habitId: string, status: string }>(page, 'entries')).some(
          e => e.habitId === habit.id && e.status === 'done',
        ),
      )
      .toBe(true)
    await page.reload()

    await expect(page.getByText('Done: 1')).toBeVisible()
    await dash.reviewedTab()
    await expect(dash.card('Daily greens')).toContainText('Done')
  })

  test('an in-place nested habit edit survives flush and reload', async ({ authedPage: page, seed }) => {
    // Regression guard for ADR-0004 plain snapshots: editing a habit name is an
    // in-place mutation of a nested store record (`habit.name = ...`). The
    // bootstrap deep-watch must still detect it now that it observes live
    // reactive state rather than the detached plain snapshots.
    const habit = makeHabit({ name: 'Old name', identityStatement: 'I am a tidy person.' })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app/habits')

    await page.locator('.habit-card').filter({ hasText: 'Old name' }).getByRole('link', { name: 'Edit' }).click()
    const form = new HabitFormPage(page)
    await form.setName('New name')
    await form.submit()
    await expect(page.locator('.habit-card').filter({ hasText: 'New name' })).toBeVisible()

    await flushSave(page)
    await expect
      .poll(async () => (await readPersistedStore<{ name: string }>(page, 'habits')).some(h => h.name === 'New name'))
      .toBe(true)

    await page.reload()
    await expect(page.locator('.habit-card').filter({ hasText: 'New name' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Old name' })).toHaveCount(0)
  })

  test('the auth flag survives a reload', async ({ page }) => {
    // Log in via the UI (no init-script helper) so the persisted localStorage
    // flag is what keeps the session after a reload.
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Continue to Atomic Habit Tracker' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue with demo login' }).click()
    await expect(page).toHaveURL(appRoutePattern('/app'))

    await page.reload()
    await expect(page).toHaveURL(appRoutePattern('/app'))
  })
})

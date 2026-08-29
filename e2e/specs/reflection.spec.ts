import { test, expect } from '../support/fixtures'
import { DashboardPage } from '../support/pages/dashboard'
import { addDaysKey, makeAppData, makeHabit, makeEntry, todayKey } from '../support/data'
import { appRoutePattern } from '../support/url'

// A habit with a single missed entry yesterday — produces one pending reflection.
function missedYesterday(name: string) {
  const habit = makeHabit({
    name,
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: addDaysKey(todayKey(), -10),
  })
  const entry = makeEntry({ habitId: habit.id, date: addDaysKey(todayKey(), -1), status: 'missed' })
  return { habit, data: makeAppData({ habits: [habit], entries: [entry] }) }
}

test.describe('Reflection → coaching', () => {
  test('a fresh miss creates a pending reflection and a dashboard alert', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [missedYesterday('Read 20 pages').habit] }))
    // Mark today's instance missed via the UI for an end-to-end path.
    await page.goto('/app')
    const dash = new DashboardPage(page)
    await dash.markMissed('Read 20 pages')

    await expect(page.getByText(/need(s)? reflection/)).toBeVisible()

    await page.getByRole('link', { name: 'Review', exact: true }).click()
    await expect(page).toHaveURL(appRoutePattern('/app/review'))
    await expect(page.getByText('Read 20 pages').first()).toBeVisible()
  })

  test('submitting a reflection generates coaching suggestions', async ({ authedPage: page, seed }) => {
    await seed(missedYesterday('Evening reading').data)
    await page.goto('/app/review')

    await expect(page.getByRole('heading', { name: 'Review missed habits' })).toBeVisible()
    await page.getByRole('button', { name: 'Reflect latest' }).click()

    // Reflection modal.
    await expect(page.getByRole('heading', { name: 'Missed habit reflection' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Optional details' }).fill('Got home late.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText('Reflection saved').first()).toBeVisible()

    // A coaching suggestion now renders for the habit.
    const suggestionCard = page.getByText('Coaching suggestions')
    await expect(suggestionCard).toBeVisible()
    await expect(page.getByText('No coaching yet')).toHaveCount(0)
  })

  test('"Why this helps" expands the rationale', async ({ authedPage: page, seed }) => {
    await seed(missedYesterday('Stretching').data)
    await page.goto('/app/review')

    await page.getByRole('button', { name: 'Reflect latest' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Reflection saved').first()).toBeVisible()

    const whyButton = page.getByRole('button', { name: 'Why this helps' }).first()
    await expect(whyButton).toBeVisible()
    await whyButton.click()
    // The rationale paragraph appears once expanded.
    await expect(page.locator('p.text-xs.text-muted').first()).toBeVisible()
  })

  test('the empty review state shows when nothing is pending', async ({ authedPage: page }) => {
    await page.goto('/app/review')
    await expect(page.getByText('No pending reflections')).toBeVisible()
    await expect(page.getByText('No coaching yet')).toBeVisible()
  })
})

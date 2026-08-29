import { test, expect } from '../support/fixtures'
import { HabitFormPage } from '../support/pages/habit-form'
import { DashboardPage } from '../support/pages/dashboard'
import { addDaysKey, makeAppData, makeHabit, todayKey } from '../support/data'
import { appRoutePattern } from '../support/url'

test.describe('Habit CRUD', () => {
  test('creates a build habit and shows it in the list and the queue', async ({ authedPage: page }) => {
    const form = new HabitFormPage(page)
    await form.gotoNew()

    await form.fill({
      type: 'build',
      name: 'Read 10 pages',
      identityStatement: 'I am a daily learner.',
      startDate: addDaysKey(todayKey(), -1),
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    })
    await form.submit()

    await expect(page).toHaveURL(appRoutePattern('/app/habits'))
    await expect(page.getByText('Habit created').first()).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Read 10 pages' })).toBeVisible()

    // It is due today, so it shows in the dashboard queue. Navigate in-app
    // (client-side) so the just-created habit doesn't depend on a debounced save.
    const dash = new DashboardPage(page)
    await page.getByRole('link', { name: 'Today' }).click()
    await expect(dash.card('Read 10 pages')).toBeVisible()
  })

  test('creates a break habit', async ({ authedPage: page }) => {
    const form = new HabitFormPage(page)
    await form.gotoNew()

    await form.fill({
      type: 'break',
      name: 'No late-night snacks',
      identityStatement: 'I protect my sleep.',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    })
    await form.submit()

    const card = page.locator('.habit-card').filter({ hasText: 'No late-night snacks' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Break')
  })

  test('rejects an invalid name (too short)', async ({ authedPage: page }) => {
    const form = new HabitFormPage(page)
    await form.gotoNew()

    await form.fill({ name: 'A', identityStatement: 'I am consistent.', weekdays: [1] })
    await form.submit()

    await expect(page.getByText('Name must be at least 2 characters.')).toBeVisible()
    await expect(page).toHaveURL(appRoutePattern('/app/habits/new'))
  })

  test('requires at least one scheduled weekday', async ({ authedPage: page }) => {
    const form = new HabitFormPage(page)
    await form.gotoNew()

    await form.fill({ name: 'Meditate', identityStatement: 'I am calm and focused.', weekdays: [] })
    await form.submit()

    await expect(page.getByText('Select at least one day').first()).toBeVisible()
  })

  test('edits an existing habit name', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({ name: 'Old name', identityStatement: 'I am a tidy person.' })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app/habits')

    await page.locator('.habit-card').filter({ hasText: 'Old name' }).getByRole('link', { name: 'Edit' }).click()
    await expect(page).toHaveURL(appRoutePattern(`/app/habits/${habit.id}`))

    const form = new HabitFormPage(page)
    await form.setName('New name')
    await form.submit()

    await expect(page.locator('.habit-card').filter({ hasText: 'New name' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Old name' })).toHaveCount(0)
  })

  test('form weekday order honors a Sunday week start', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ settings: { weekStartsOn: 0 } }))
    await page.goto('/app/habits/new')

    const form = new HabitFormPage(page)
    await expect.poll(() => form.renderedWeekdayOrder()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test('form weekday order honors a Monday week start', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ settings: { weekStartsOn: 1 } }))
    await page.goto('/app/habits/new')

    const form = new HabitFormPage(page)
    await expect.poll(() => form.renderedWeekdayOrder()).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  test('form selection stays keyed by weekday number under a Sunday start', async ({ authedPage: page, seed }) => {
    // Sunday-first display must not change which weekday numbers are stored: a
    // Sunday+Monday selection persists (and renders) as the canonical order.
    await seed(makeAppData({ settings: { weekStartsOn: 0 } }))
    await page.goto('/app/habits/new')

    const form = new HabitFormPage(page)
    await form.fill({
      type: 'build',
      name: 'Sunday planning',
      identityStatement: 'I plan my week deliberately.',
      weekdays: [0, 1],
    })
    await form.submit()

    const card = page.locator('.habit-card').filter({ hasText: 'Sunday planning' })
    await expect(card).toContainText('Days: Sun, Mon')
  })

  test('habit-list schedule text follows weekStartsOn', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({ name: 'Weekend reset', scheduleWeekdays: [0, 1] })

    // Sunday start → Sunday first.
    await seed(makeAppData({ habits: [habit], settings: { weekStartsOn: 0 } }))
    await page.goto('/app/habits')
    await expect(
      page.locator('.habit-card').filter({ hasText: 'Weekend reset' }),
    ).toContainText('Days: Sun, Mon')

    // Monday start → Monday first (Sunday moves to the end).
    await seed(makeAppData({ habits: [habit], settings: { weekStartsOn: 1 } }))
    await page.goto('/app/habits')
    await expect(
      page.locator('.habit-card').filter({ hasText: 'Weekend reset' }),
    ).toContainText('Days: Mon, Sun')
  })

  test('archiving removes a habit from the active list and the queue', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({
      name: 'Evening walk',
      scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
      startDate: addDaysKey(todayKey(), -2),
    })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app/habits')

    const card = page.locator('.habit-card').filter({ hasText: 'Evening walk' })
    await card.getByRole('button', { name: 'Archive' }).click()

    // Hidden by default; revealed when showing archived habits.
    await expect(page.locator('.habit-card').filter({ hasText: 'Evening walk' })).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Show archived habits' }).check()
    await expect(page.locator('.habit-card').filter({ hasText: 'Evening walk' })).toContainText('Archived')

    // No longer due in the queue.
    const dash = new DashboardPage(page)
    await page.getByRole('link', { name: 'Today' }).click()
    await expect(dash.card('Evening walk')).toHaveCount(0)
  })
})

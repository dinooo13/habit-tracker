import type { Page } from '@playwright/test'
import { test, expect } from '../support/fixtures'
import { DashboardPage } from '../support/pages/dashboard'
import { HabitFormPage } from '../support/pages/habit-form'
import { authenticate, readPersistedStore } from '../support/seed'
import { addDaysKey, makeAppData, makeHabit, todayKey } from '../support/data'

// The bootstrap plugin flushes its debounced save on visibilitychange → hidden.
async function flushSave(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function renameHabit(page: Page, from: string, to: string): Promise<void> {
  await page.locator('.habit-card').filter({ hasText: from }).getByRole('link', { name: 'Edit' }).click()
  const form = new HabitFormPage(page)
  await form.setName(to)
  await form.submit()
}

// A fast, single-click same-record edit (no navigation) — commits well within a
// peer tab's 800ms debounce window, unlike the multi-step form rename.
async function archiveHabit(page: Page, name: string): Promise<void> {
  await page.locator('.habit-card').filter({ hasText: name }).getByRole('button', { name: 'Archive' }).click()
}

function habitNames(page: Page): Promise<string[]> {
  return readPersistedStore<{ name: string }>(page, 'habits').then(rows => rows.map(row => row.name))
}

function habitRows(page: Page): Promise<{ name: string, archived: boolean }[]> {
  return readPersistedStore<{ name: string, archived: boolean }>(page, 'habits')
}

function archivedFocusBlock(rows: { name: string, archived: boolean }[]): boolean | undefined {
  return rows.find(row => row.name === 'Focus block')?.archived
}

test.describe('Cross-tab conflict protection (#67)', () => {
  // Two pages in ONE BrowserContext share the same IndexedDB and BroadcastChannel;
  // two separate contexts would get separate storage partitions (ADR-0024).
  test('non-overlapping edits in two tabs both survive', async ({ authedPage: page, seed }) => {
    const alpha = makeHabit({ name: 'Alpha', startDate: addDaysKey(todayKey(), -5) })
    const beta = makeHabit({ name: 'Beta', startDate: addDaysKey(todayKey(), -5) })
    await seed(makeAppData({ habits: [alpha, beta] }))
    await page.goto('/app/habits')

    const page2 = await page.context().newPage()
    await page2.goto('/app/habits')
    await expect(page2.locator('.habit-card').filter({ hasText: 'Beta' })).toBeVisible()

    // Tab A renames Alpha and flushes.
    await renameHabit(page, 'Alpha', 'Alpha Renamed')
    await flushSave(page)
    await expect.poll(() => habitNames(page)).toContain('Alpha Renamed')

    // Tab B (never reloaded) renames Beta and flushes.
    await renameHabit(page2, 'Beta', 'Beta Renamed')
    await flushSave(page2)

    // Both edits survive in storage and after a reload of either tab.
    await expect.poll(() => habitNames(page2)).toEqual(
      expect.arrayContaining(['Alpha Renamed', 'Beta Renamed']),
    )
    await page.reload()
    await expect(page.locator('.habit-card').filter({ hasText: 'Alpha Renamed' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Beta Renamed' })).toBeVisible()
  })

  test('an idle tab picks up a peer write without reloading', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({
      name: 'Daily greens',
      scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
      startDate: addDaysKey(todayKey(), -2),
    })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app')

    const page2 = await page.context().newPage()
    await page2.goto('/app')
    await expect(page2.getByText('Done: 0')).toBeVisible()

    const dash = new DashboardPage(page)
    await dash.markDone('Daily greens')
    await expect(page.getByText('Done: 1')).toBeVisible()
    await flushSave(page)

    // The idle tab re-hydrates from the peer's broadcast — no reload.
    await expect(page2.getByText('Done: 1')).toBeVisible({ timeout: 15_000 })
  })

  test('a genuine collision prompts, and the newer data survives', async ({ authedPage: page, seed }) => {
    const habit = makeHabit({ name: 'Focus block', startDate: addDaysKey(todayKey(), -5) })
    await seed(makeAppData({ habits: [habit] }))
    await page.goto('/app/habits')

    const page2 = await page.context().newPage()
    await authenticate(page2)
    await page2.goto('/app/habits')
    await expect(page2.locator('.habit-card').filter({ hasText: 'Focus block' })).toBeVisible()

    // Tab B renames the habit but does NOT flush: its 800ms debounced guarded save
    // is now pending on the stored revision, so the tab is dirty and a peer write
    // is deferred rather than silently applied over the unsaved edit.
    await renameHabit(page2, 'Focus block', 'B version')

    // Tab A changes the SAME habit a different way (archive) and flushes. Archive
    // is a single click with no navigation, so it commits well within Tab B's
    // 800ms window — the stored revision moves ahead while Tab B is still pending
    // on the old one. (Two slow form renames would let Tab B's own debounce commit
    // first, serialising the edits so no genuine collision ever occurs.)
    await archiveHabit(page, 'Focus block')
    await flushSave(page)
    await expect.poll(() => habitRows(page).then(archivedFocusBlock)).toBe(true)

    // Tab B's still-pending debounced save now lands on the stale revision → the
    // same habit was changed in both tabs (renamed here, archived there) → a
    // genuine three-way collision, which suspends auto-save and shows the banner.
    // No explicit flush: the teardown flush uses a fire-and-forget save that drops
    // a stale write silently, so the debounced guarded save is what surfaces it.
    await expect(page2.getByText('Another tab changed the same things')).toBeVisible({ timeout: 15_000 })

    // The newer data is never discarded: storage still holds A's version (archived,
    // and never renamed to Tab B's value, whose save stayed suspended).
    await expect.poll(() => habitRows(page2).then(rows => rows.map(row => row.name))).not.toContain('B version')
    await expect.poll(() => habitRows(page2).then(archivedFocusBlock)).toBe(true)

    // Reload with latest lands Tab B on the winning version: its rename is gone and
    // A's archived habit is what remains.
    await page2.getByRole('button', { name: 'Reload with latest' }).click()
    await expect(page2.locator('.habit-card').filter({ hasText: 'B version' })).toHaveCount(0)
    await page2.getByRole('checkbox', { name: 'Show archived habits' }).check()
    await expect(page2.locator('.habit-card').filter({ hasText: 'Focus block' })).toBeVisible()
  })
})

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

function habitNames(page: Page): Promise<string[]> {
  return readPersistedStore<{ name: string }>(page, 'habits').then(rows => rows.map(row => row.name))
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

    // Tab B edits the same habit first (its debounced save stays pending), making
    // it dirty so a peer write is not silently applied.
    await renameHabit(page2, 'Focus block', 'B version')

    // Tab A renames the same habit and flushes — the stored revision moves ahead.
    await renameHabit(page, 'Focus block', 'A version')
    await flushSave(page)
    await expect.poll(() => habitNames(page)).toContain('A version')

    // Tab B flushes onto the stale revision → same record changed twice → conflict.
    await flushSave(page2)
    await expect(page2.getByText('Another tab changed the same things')).toBeVisible({ timeout: 15_000 })

    // The newer data is never discarded: storage still holds A's version.
    await expect.poll(() => habitNames(page2)).toContain('A version')

    // Reload with latest lands tab B on the winning version.
    await page2.getByRole('button', { name: 'Reload with latest' }).click()
    await expect(page2.locator('.habit-card').filter({ hasText: 'A version' })).toBeVisible()
  })
})

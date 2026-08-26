import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bootstrapPlugin from '~/plugins/bootstrap.client'
import { useClock } from '~/composables/use-clock'
import { useReminderEngine } from '~/composables/use-reminder-engine'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useSettingsStore } from '~/stores/settings'
import type { Habit } from '~/types/app-data'
import { addDays, todayDateKey } from '~/utils/domain/date'

const NOON_JUL_15 = new Date('2026-07-15T12:00:00.000Z')

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-07-10',
    archived: false,
    pauses: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

// Exercises the *production* wiring: the real bootstrap plugin registers the
// clock's rollover → reconcileDerivedState hook. A hand-rolled onRollover here
// could pass even if the plugin wiring were missing — this cannot (issue #70).
describe('bootstrap.client — rollover reconciliation wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOON_JUL_15)
    useClock().stop()
    useReminderEngine().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
  })

  afterEach(() => {
    useClock().stop()
    useReminderEngine().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
    vi.useRealTimers()
  })

  it('a local-midnight rollover backfills the previous day’s missed entry', async () => {
    // Run the actual plugin: load (falls back to empty here), install the persist
    // watch, register onRollover(reconcile), start the clock.
    await (bootstrapPlugin as unknown as (app: unknown) => Promise<void>)(useNuxtApp())

    // A habit due every day since day 10, with no entries logged yet.
    const day15 = todayDateKey()
    useHabitsStore().hydrate([buildHabit({ startDate: addDays(day15, -5) })])
    const entriesStore = useEntriesStore()
    expect(entriesStore.entries).toHaveLength(0)

    // Cross local midnight: the clock detects the new day and the plugin's
    // rollover hook runs reconcileDerivedState(day16).
    vi.setSystemTime(new Date(NOON_JUL_15.getTime() + 24 * 60 * 60 * 1000))
    useClock().syncNow()

    // Yesterday (day15) was due and unlogged → backfilled as missed.
    const missed = entriesStore.entries.filter(entry => entry.status === 'missed')
    expect(missed.some(entry => entry.date === day15)).toBe(true)
  })
})

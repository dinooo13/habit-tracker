import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import InsightsPage from '~/pages/app/insights.vue'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { todayDateKey, weekdayFromDateKey } from '~/utils/domain/date'
import type { Habit, HabitEntry } from '~/types/app-data'

// Midday UTC keeps the derived local date key stable in any CI timezone.
const FROZEN_NOW = new Date('2026-07-15T12:00:00.000Z')

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Read 10 pages',
    type: 'build',
    identityStatement: 'I am a person who reads every day.',
    scheduleWeekdays: [],
    reminderTime: null,
    startDate: '2026-01-01',
    archived: false,
    pauses: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-07-15',
    status: 'done',
    completedAt: '2026-07-15T09:00:00.000Z',
    missReasonCode: null,
    missReasonNote: null,
    ...overrides,
  }
}

describe('Insights page — completion rate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    // Reset the Nuxt-global Pinia stores, timers, and mounted state so nothing
    // leaks into the next test that shares the same Nuxt app instance.
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    vi.useRealTimers()
  })

  it('renders a 50% seven-day completion rate for one of two due habit-days', async () => {
    const today = todayDateKey()
    const todayWeekday = weekdayFromDateKey(today)

    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    // Two active habits due only on today's weekday, so each contributes exactly
    // one due day inside the default 7-day window: two due habit-days total.
    habitsStore.hydrate([
      buildHabit({ id: 'habit_1', scheduleWeekdays: [todayWeekday] }),
      buildHabit({ id: 'habit_2', name: 'Meditate', scheduleWeekdays: [todayWeekday] }),
    ])
    // One habit is done today; the other has no entry: one of two → 50%.
    entriesStore.hydrate([
      buildEntry({ id: 'entry_1', habitId: 'habit_1', date: today, status: 'done' }),
    ])
    coachStore.hydrate([])

    const wrapper = await mountSuspended(InsightsPage)
    const text = wrapper.text()

    expect(text).toContain('Completion for last 7 days')
    expect(text).toContain('50%')
  })
})

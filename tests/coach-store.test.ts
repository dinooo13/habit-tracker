import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCoachStore } from '~/stores/coach'
import type { Habit, HabitEntry } from '~/types/app-data'

function buildHabit(): Habit {
  return {
    id: 'habit_1',
    name: 'Avoid bugs',
    type: 'break',
    identityStatement: 'I am careful.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-08',
    archived: false,
    createdAt: '2026-02-08T00:00:00.000Z',
    updatedAt: '2026-02-08T00:00:00.000Z'
  }
}

function buildReflectedMissedEntry(): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-02-08',
    status: 'missed',
    completedAt: null,
    missReasonCode: 'no_time',
    missReasonNote: 'Too busy'
  }
}

describe('coach store reconciliation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('backfills suggestions for reflected missed entries without coaching', () => {
    const store = useCoachStore()

    const created = store.reconcileMissingSuggestions([buildHabit()], [buildReflectedMissedEntry()])

    expect(created).toBe(2)
    expect(store.suggestions).toHaveLength(2)
    expect(store.suggestions[0]?.entryId).toBe('entry_1')
  })

  it('does not duplicate suggestions on repeated reconciliation', () => {
    const store = useCoachStore()
    const habits = [buildHabit()]
    const entries = [buildReflectedMissedEntry()]

    store.reconcileMissingSuggestions(habits, entries)
    const created = store.reconcileMissingSuggestions(habits, entries)

    expect(created).toBe(0)
    expect(store.suggestions).toHaveLength(2)
  })
})

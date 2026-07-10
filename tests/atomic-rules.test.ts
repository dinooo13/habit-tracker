import { describe, expect, it } from 'vitest'
import { generateSuggestionsForMissedEntry } from '~/utils/domain/atomic-rules'
import type { Habit, HabitEntry } from '~/types/app-data'

function buildHabit(type: 'build' | 'break'): Habit {
  return {
    id: 'habit_1',
    name: 'Example habit',
    type,
    identityStatement: 'I am consistent.',
    scheduleWeekdays: [1, 2, 3],
    reminderTime: '07:30',
    startDate: '2026-02-01',
    archived: false,
    pauses: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  }
}

function buildEntry(reason: HabitEntry['missReasonCode']): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-02-05',
    status: 'missed',
    completedAt: null,
    missReasonCode: reason,
    missReasonNote: null,
  }
}

describe('generateSuggestionsForMissedEntry', () => {
  it('returns deterministic build-habit tactics', () => {
    const suggestions = generateSuggestionsForMissedEntry(buildEntry('forgot'), buildHabit('build'))

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0].law).toBe('obvious')
    expect(suggestions[0].direction).toBe('increase')
    expect(suggestions[0].entryId).toBe('entry_1')
  })

  it('returns deterministic break-habit tactics', () => {
    const suggestions = generateSuggestionsForMissedEntry(buildEntry('low_motivation'), buildHabit('break'))

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0].law).toBe('attractive')
    expect(suggestions[0].direction).toBe('decrease')
  })
})

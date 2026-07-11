import { describe, expect, it, vi } from 'vitest'
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

  it('injects deterministic ids and timestamps once per suggestion', () => {
    const idFactory = vi.fn((index: number) => `custom_id_${index}`)
    const createdAtFactory = vi.fn((index: number) => `2026-02-05T21:0${index}:00.000Z`)

    const suggestions = generateSuggestionsForMissedEntry(
      buildEntry('forgot'),
      buildHabit('build'),
      { idFactory, createdAtFactory },
    )

    expect(suggestions).toHaveLength(2)
    expect(suggestions.map(s => s.id)).toEqual(['custom_id_0', 'custom_id_1'])
    expect(suggestions.map(s => s.createdAt)).toEqual([
      '2026-02-05T21:00:00.000Z',
      '2026-02-05T21:01:00.000Z',
    ])

    // Each factory is called exactly once per suggestion, with the zero-based index.
    expect(idFactory).toHaveBeenCalledTimes(2)
    expect(createdAtFactory).toHaveBeenCalledTimes(2)
    expect(idFactory.mock.calls).toEqual([[0], [1]])
    expect(createdAtFactory.mock.calls).toEqual([[0], [1]])

    // Factories never alter rule selection or content.
    expect(suggestions[0].law).toBe('obvious')
    expect(suggestions[0].direction).toBe('increase')
  })

  it('defaults to createId/nowIso when no factories are supplied', () => {
    const suggestions = generateSuggestionsForMissedEntry(buildEntry('forgot'), buildHabit('build'))

    for (const suggestion of suggestions) {
      expect(suggestion.id).toMatch(/^suggestion_/)
      expect(suggestion.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    }
    // Distinct random ids per suggestion.
    expect(new Set(suggestions.map(s => s.id)).size).toBe(suggestions.length)
  })
})

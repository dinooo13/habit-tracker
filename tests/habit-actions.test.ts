import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useHabitActions } from '~/composables/use-habit-actions'

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-01',
    archived: false,
    pauses: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-02-10',
    status: 'missed',
    completedAt: null,
    missReasonCode: null,
    missReasonNote: null,
    ...overrides,
  }
}

function buildSuggestion(overrides: Partial<CoachingSuggestion> = {}): CoachingSuggestion {
  return {
    id: 'sug_1',
    entryId: 'entry_1',
    law: 'obvious',
    direction: 'increase',
    title: 't',
    action: 'a',
    rationale: 'r',
    createdAt: '2026-02-10T00:00:00.000Z',
    ...overrides,
  }
}

/** A reflected miss on 2026-02-10 with two hydrated suggestions. */
function seedReflectedMissWithSuggestions() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()

  habitsStore.hydrate([buildHabit()])
  entriesStore.hydrate([
    buildEntry({ id: 'entry_1', date: '2026-02-10', status: 'missed', missReasonCode: 'no_time', missReasonNote: 'busy' }),
  ])
  coachStore.hydrate([
    buildSuggestion({ id: 'sug_a', entryId: 'entry_1' }),
    buildSuggestion({ id: 'sug_b', entryId: 'entry_1' }),
  ])

  return { habitsStore, entriesStore, coachStore }
}

describe('useHabitActions — recordHabitStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('clears orphan suggestions when a reflected miss is marked done', () => {
    const { entriesStore, coachStore } = seedReflectedMissWithSuggestions()

    const entry = useHabitActions().recordHabitStatus('habit_1', '2026-02-10', 'done')

    expect(entry.status).toBe('done')
    expect(entry.missReasonCode).toBeNull()
    expect(coachStore.suggestionsForEntry('entry_1')).toHaveLength(0)
    expect(coachStore.suggestions).toHaveLength(0)
    expect(entriesStore.entryByHabitAndDate('habit_1', '2026-02-10')?.status).toBe('done')
  })

  it('clears orphan suggestions when a reflected miss is skipped', () => {
    const { coachStore } = seedReflectedMissWithSuggestions()

    const entry = useHabitActions().recordHabitStatus('habit_1', '2026-02-10', 'skipped')

    expect(entry.status).toBe('skipped')
    expect(coachStore.suggestions).toHaveLength(0)
  })

  it('open → missed creates an unreflected miss with zero suggestions', () => {
    const habitsStore = useHabitsStore()
    const coachStore = useCoachStore()
    habitsStore.hydrate([buildHabit()])

    const entry = useHabitActions().recordHabitStatus('habit_1', '2026-02-11', 'missed')

    expect(entry.status).toBe('missed')
    expect(entry.missReasonCode).toBeNull()
    expect(coachStore.suggestions).toHaveLength(0)
  })

  it('re-marking a reflected miss as missed retains its reflection and suggestions', () => {
    const { coachStore } = seedReflectedMissWithSuggestions()

    const entry = useHabitActions().recordHabitStatus('habit_1', '2026-02-10', 'missed')

    expect(entry.status).toBe('missed')
    expect(entry.missReasonCode).toBe('no_time')
    expect(coachStore.suggestionsForEntry('entry_1')).toHaveLength(2)
  })
})

describe('useHabitActions — reopenEntry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes the entry and its suggestions', () => {
    const { entriesStore, coachStore } = seedReflectedMissWithSuggestions()

    const removed = useHabitActions().reopenEntry('habit_1', '2026-02-10')

    expect(removed?.id).toBe('entry_1')
    expect(entriesStore.entryByHabitAndDate('habit_1', '2026-02-10')).toBeUndefined()
    expect(coachStore.suggestions).toHaveLength(0)
  })

  it('returns null and changes nothing on a day with no entry', () => {
    const { coachStore } = seedReflectedMissWithSuggestions()

    const removed = useHabitActions().reopenEntry('habit_1', '2026-02-20')

    expect(removed).toBeNull()
    expect(coachStore.suggestions).toHaveLength(2)
  })
})

describe('useHabitActions — recordReflection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('regenerates coaching exactly once across repeated calls', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    habitsStore.hydrate([buildHabit()])
    entriesStore.hydrate([buildEntry({ id: 'entry_1', status: 'missed', missReasonCode: null })])

    const first = useHabitActions().recordReflection('entry_1', 'no_time', 'busy')
    const countAfterFirst = coachStore.suggestions.length
    const second = useHabitActions().recordReflection('entry_1', 'no_time', 'still busy')

    expect(first?.suggestions.length).toBeGreaterThan(0)
    expect(countAfterFirst).toBeGreaterThan(0)
    expect(coachStore.suggestions).toHaveLength(countAfterFirst)
    expect(second?.suggestions).toHaveLength(countAfterFirst)
    expect(coachStore.suggestions.every(s => s.entryId === 'entry_1')).toBe(true)
  })

  it('returns null and generates nothing for an unknown entry', () => {
    const habitsStore = useHabitsStore()
    const coachStore = useCoachStore()
    habitsStore.hydrate([buildHabit()])

    const result = useHabitActions().recordReflection('no_such_entry', 'no_time', null)

    expect(result).toBeNull()
    expect(coachStore.suggestions).toHaveLength(0)
  })

  it('returns null when the entry has no matching habit', () => {
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    // Entry present but its habit was never hydrated.
    entriesStore.hydrate([buildEntry({ id: 'entry_1', habitId: 'habit_gone', status: 'missed', missReasonCode: null })])

    const result = useHabitActions().recordReflection('entry_1', 'no_time', null)

    expect(result).toBeNull()
    expect(coachStore.suggestions).toHaveLength(0)
  })
})

describe('useHabitActions — reconcilePauseCleanup', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes only the unreflected in-pause miss and its suggestion', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    habitsStore.hydrate([buildHabit({ pauses: [{ start: '2026-03-03', end: '2026-03-05' }] })])
    entriesStore.hydrate([
      buildEntry({ id: 'e_unreflected', date: '2026-03-04', status: 'missed', missReasonCode: null }),
      buildEntry({ id: 'e_reflected', date: '2026-03-04', status: 'missed', missReasonCode: 'forgot' }),
      buildEntry({ id: 'e_done', date: '2026-03-05', status: 'done', completedAt: '2026-03-05T08:00:00.000Z' }),
      buildEntry({ id: 'e_skipped', date: '2026-03-03', status: 'skipped' }),
      buildEntry({ id: 'e_outside', date: '2026-03-09', status: 'missed', missReasonCode: null }),
    ])
    coachStore.hydrate([buildSuggestion({ id: 'sug_1', entryId: 'e_unreflected' })])

    const removed = useHabitActions().reconcilePauseCleanup('habit_1')

    expect(removed).toBe(1)
    expect(entriesStore.entries.map(entry => entry.id).sort()).toEqual([
      'e_done',
      'e_outside',
      'e_reflected',
      'e_skipped',
    ])
    expect(coachStore.suggestions).toHaveLength(0)
  })

  it('returns 0 when the habit has no pauses', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    habitsStore.hydrate([buildHabit()])
    entriesStore.hydrate([buildEntry({ id: 'e1', date: '2026-03-04', status: 'missed', missReasonCode: null })])

    expect(useHabitActions().reconcilePauseCleanup('habit_1')).toBe(0)
    expect(entriesStore.entries).toHaveLength(1)
  })
})

describe('useHabitActions — deleteHabitCascade', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes the habit, its entries, and their suggestions, sparing others', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    habitsStore.hydrate([buildHabit({ id: 'habit_1' }), buildHabit({ id: 'habit_2' })])
    entriesStore.hydrate([
      buildEntry({ id: 'e1', habitId: 'habit_1', date: '2026-02-10', status: 'missed', missReasonCode: 'no_time' }),
      buildEntry({ id: 'e2', habitId: 'habit_1', date: '2026-02-11', status: 'done', completedAt: 'x' }),
      buildEntry({ id: 'e_other', habitId: 'habit_2', date: '2026-02-10', status: 'missed', missReasonCode: 'forgot' }),
    ])
    coachStore.hydrate([
      buildSuggestion({ id: 's1', entryId: 'e1' }),
      buildSuggestion({ id: 's_other', entryId: 'e_other' }),
    ])

    const result = useHabitActions().deleteHabitCascade('habit_1')

    expect(result).toEqual({ entries: 2, suggestions: 1 })
    expect(habitsStore.habits.map(h => h.id)).toEqual(['habit_2'])
    expect(entriesStore.entries.map(e => e.id)).toEqual(['e_other'])
    expect(coachStore.suggestions.map(s => s.id)).toEqual(['s_other'])
  })
})

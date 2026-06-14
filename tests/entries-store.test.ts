import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEntriesStore } from '~/stores/entries'
import type { Habit, HabitEntry } from '~/types/app-data'

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-08',
    archived: false,
    createdAt: '2026-02-08T00:00:00.000Z',
    updatedAt: '2026-02-08T00:00:00.000Z',
    ...overrides
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-02-08',
    status: 'done',
    completedAt: '2026-02-08T10:00:00.000Z',
    missReasonCode: null,
    missReasonNote: null,
    ...overrides
  }
}

describe('entries store — setStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates a new entry with completedAt set when status is done', () => {
    const store = useEntriesStore()
    const entry = store.setStatus('habit_1', '2026-02-08', 'done')

    expect(entry.habitId).toBe('habit_1')
    expect(entry.date).toBe('2026-02-08')
    expect(entry.status).toBe('done')
    expect(entry.completedAt).not.toBeNull()
    expect(() => new Date(entry.completedAt!)).not.toThrow()
    expect(store.entries).toHaveLength(1)
  })

  it('creates a new entry with null completedAt when status is skipped', () => {
    const store = useEntriesStore()
    const entry = store.setStatus('habit_1', '2026-02-08', 'skipped')

    expect(entry.status).toBe('skipped')
    expect(entry.completedAt).toBeNull()
  })

  it('creates a new entry with null completedAt when status is missed', () => {
    const store = useEntriesStore()
    const entry = store.setStatus('habit_1', '2026-02-08', 'missed')

    expect(entry.status).toBe('missed')
    expect(entry.completedAt).toBeNull()
  })

  it('updates an existing entry from done to skipped and clears missReason fields', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', missReasonCode: 'no_time', missReasonNote: 'Too busy' })])

    const updated = store.setStatus('habit_1', '2026-02-08', 'skipped')

    expect(updated.status).toBe('skipped')
    expect(updated.completedAt).toBeNull()
    expect(updated.missReasonCode).toBeNull()
    expect(updated.missReasonNote).toBeNull()
    expect(store.entries).toHaveLength(1)
  })

  it('updating an existing entry to missed preserves existing missReason fields', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'done', missReasonCode: null, missReasonNote: null })])

    // First set it to missed with a reason
    store.setStatus('habit_1', '2026-02-08', 'missed')
    const entry = store.entryByHabitAndDate('habit_1', '2026-02-08')!
    entry.missReasonCode = 'forgot'
    entry.missReasonNote = 'Slept in'

    // Update back to missed — missReason must be preserved
    const updated = store.setStatus('habit_1', '2026-02-08', 'missed')
    expect(updated.missReasonCode).toBe('forgot')
    expect(updated.missReasonNote).toBe('Slept in')
  })

  it('corrects a past day: flips a backfilled missed entry to done in place', () => {
    const store = useEntriesStore()
    // Simulate a day that was auto-backfilled as missed (the time-travel correction path).
    store.hydrate([buildEntry({ date: '2026-02-05', status: 'missed', completedAt: null })])

    const corrected = store.setStatus('habit_1', '2026-02-05', 'done')

    expect(corrected.id).toBe('entry_1') // same entry, mutated in place
    expect(corrected.status).toBe('done')
    expect(corrected.completedAt).not.toBeNull()
    expect(store.entries).toHaveLength(1)
    expect(store.entryByHabitAndDate('habit_1', '2026-02-05')?.status).toBe('done')
  })

  it('updating an existing entry to done sets completedAt to a valid ISO string', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', completedAt: null })])

    const updated = store.setStatus('habit_1', '2026-02-08', 'done')

    expect(updated.completedAt).not.toBeNull()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(updated.completedAt!)).toBe(true)
  })
})

describe('entries store — clearStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes and returns the entry when it exists', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry()])

    const removed = store.clearStatus('habit_1', '2026-02-08')

    expect(removed).not.toBeNull()
    expect(removed?.id).toBe('entry_1')
    expect(store.entries).toHaveLength(0)
  })

  it('returns null when the entry does not exist', () => {
    const store = useEntriesStore()

    const result = store.clearStatus('habit_1', '2026-02-08')

    expect(result).toBeNull()
  })
})

describe('entries store — setMissReason', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sets the miss reason code and trims the note', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', completedAt: null })])

    const updated = store.setMissReason('entry_1', 'no_time', '  Too busy  ')

    expect(updated).not.toBeNull()
    expect(updated?.status).toBe('missed')
    expect(updated?.missReasonCode).toBe('no_time')
    expect(updated?.missReasonNote).toBe('Too busy')
  })

  it('sets missReasonNote to null when note is whitespace-only', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', completedAt: null })])

    const updated = store.setMissReason('entry_1', 'forgot', '   ')

    expect(updated?.missReasonNote).toBeNull()
  })

  it('sets missReasonNote to null when note is null', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', completedAt: null })])

    const updated = store.setMissReason('entry_1', 'forgot', null)

    expect(updated?.missReasonNote).toBeNull()
  })

  it('returns null for an unknown entry id', () => {
    const store = useEntriesStore()

    const result = store.setMissReason('no_such_entry', 'forgot', null)

    expect(result).toBeNull()
  })

  it('forces status to missed even when entry was previously done', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'done' })])

    const updated = store.setMissReason('entry_1', 'no_time', null)

    expect(updated?.status).toBe('missed')
  })
})

describe('entries store — ensureMissedEntries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('backfills missed entries only for due weekdays between startDate and yesterday', () => {
    const store = useEntriesStore()
    // Habit scheduled only on Mondays (weekday 1). startDate 2026-02-02 (Monday).
    // currentDateKey 2026-02-10 (Tuesday). Yesterday = 2026-02-09 (Monday).
    // Due dates in [2026-02-02, 2026-02-09]: 2026-02-02 and 2026-02-09.
    const habit = buildHabit({
      id: 'habit_mon',
      startDate: '2026-02-02',
      scheduleWeekdays: [1] // Mondays only
    })

    const count = store.ensureMissedEntries([habit], '2026-02-10')

    expect(count).toBe(2)
    const entries = store.entriesByHabit('habit_mon')
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.date).sort()).toEqual(['2026-02-02', '2026-02-09'])
    expect(entries.every((e) => e.status === 'missed')).toBe(true)
  })

  it('never creates an entry for currentDateKey itself (today)', () => {
    const store = useEntriesStore()
    // Daily habit, currentDateKey = today. Only yesterday and earlier should be backfilled.
    const habit = buildHabit({ id: 'habit_daily', startDate: '2026-02-08', scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6] })

    store.ensureMissedEntries([habit], '2026-02-08')

    // startDate == currentDateKey means latestHistoricalDate = 2026-02-07, which is before startDate
    // so compareDateKeys(startDate, latestHistoricalDate) > 0 → skipped entirely
    expect(store.entries).toHaveLength(0)
  })

  it('skips archived habits', () => {
    const store = useEntriesStore()
    const habit = buildHabit({ id: 'habit_arch', archived: true, startDate: '2026-01-01' })

    const count = store.ensureMissedEntries([habit], '2026-02-10')

    expect(count).toBe(0)
    expect(store.entries).toHaveLength(0)
  })

  it('skips habits whose startDate is today or later', () => {
    const store = useEntriesStore()
    // currentDateKey = 2026-02-10, startDate = 2026-02-10 (today)
    const habit = buildHabit({ id: 'habit_new', startDate: '2026-02-10' })

    const count = store.ensureMissedEntries([habit], '2026-02-10')

    expect(count).toBe(0)
  })

  it('is idempotent: second call returns 0 and does not duplicate entries', () => {
    const store = useEntriesStore()
    const habit = buildHabit({ id: 'habit_daily', startDate: '2026-02-08', scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6] })

    const first = store.ensureMissedEntries([habit], '2026-02-12')
    const second = store.ensureMissedEntries([habit], '2026-02-12')

    expect(first).toBeGreaterThan(0)
    expect(second).toBe(0)
  })

  it('does not overwrite existing entries', () => {
    const store = useEntriesStore()
    const habit = buildHabit({ id: 'habit_1', startDate: '2026-02-08', scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    // Pre-existing 'done' entry for 2026-02-08
    store.hydrate([buildEntry({ date: '2026-02-08', status: 'done', habitId: 'habit_1' })])

    store.ensureMissedEntries([habit], '2026-02-12')

    const existing = store.entryByHabitAndDate('habit_1', '2026-02-08')
    expect(existing?.status).toBe('done') // Must not have been overwritten to 'missed'
  })
})

describe('entries store — streakForHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns 0 for a habit with no entries', () => {
    const store = useEntriesStore()

    expect(store.streakForHabit('habit_1')).toBe(0)
  })

  it('counts consecutive trailing done entries as the streak', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'done' }),
      buildEntry({ id: 'e2', date: '2026-02-07', status: 'done' }),
      buildEntry({ id: 'e3', date: '2026-02-08', status: 'done' })
    ])

    expect(store.streakForHabit('habit_1')).toBe(3)
  })

  // CHARACTERIZATION TEST: This pins the current (quirky) behavior where trailing
  // non-done entries do NOT reset a streak that was built earlier in the history.
  // The algorithm skips non-done entries while streak === 0 (i.e., before finding
  // any done), then breaks only when it finds a non-done entry after counting done ones.
  // A sequence of [done, done, missed, missed] therefore reports streak 2, not 0.
  it('trailing misses do not reset the streak — done,done,missed,missed reports streak 2 (characterization of current behavior)', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-05', status: 'done' }),
      buildEntry({ id: 'e2', date: '2026-02-06', status: 'done' }),
      buildEntry({ id: 'e3', date: '2026-02-07', status: 'missed' }),
      buildEntry({ id: 'e4', date: '2026-02-08', status: 'missed' })
    ])

    // NOTE: The streak algorithm iterates from the end backwards. It skips non-done
    // entries while streak === 0, then counts done entries, breaking at the first non-done
    // after that. So trailing misses are skipped (streak still 0), then done entries are
    // counted. This is a known quirk — trailing misses do not reset the streak.
    expect(store.streakForHabit('habit_1')).toBe(2)
  })

  it('a miss between done entries breaks the earlier run — done,missed,done reports streak 1', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'done' }),
      buildEntry({ id: 'e2', date: '2026-02-07', status: 'missed' }),
      buildEntry({ id: 'e3', date: '2026-02-08', status: 'done' })
    ])

    expect(store.streakForHabit('habit_1')).toBe(1)
  })

  it('a skipped entry between done entries breaks the streak', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'done' }),
      buildEntry({ id: 'e2', date: '2026-02-07', status: 'skipped' }),
      buildEntry({ id: 'e3', date: '2026-02-08', status: 'done' })
    ])

    expect(store.streakForHabit('habit_1')).toBe(1)
  })
})

describe('entries store — completionRateForHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns 0 when there are no due dates in the window', () => {
    const store = useEntriesStore()
    // Habit is only due on Saturdays (weekday 6), but window contains only Mon–Fri
    const habit = buildHabit({ scheduleWeekdays: [6] })

    // 2026-02-09 (Mon) to 2026-02-13 (Fri) — no Saturdays
    const rate = store.completionRateForHabit(habit, '2026-02-09', '2026-02-13')

    expect(rate).toBe(0)
  })

  it('returns Math.round percentage for done entries over due dates', () => {
    const store = useEntriesStore()
    // Daily habit Mon–Wed (3 days due). 2 of 3 done → 66.67 → rounds to 67.
    const habit = buildHabit({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-02-09' })
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-09', status: 'done', habitId: 'habit_1' }),
      buildEntry({ id: 'e2', date: '2026-02-10', status: 'done', habitId: 'habit_1' }),
      buildEntry({ id: 'e3', date: '2026-02-11', status: 'missed', habitId: 'habit_1' })
    ])

    const rate = store.completionRateForHabit(habit, '2026-02-09', '2026-02-11')

    expect(rate).toBe(67)
  })

  it('returns 100 when all due entries are done', () => {
    const store = useEntriesStore()
    const habit = buildHabit({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-02-09' })
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-09', status: 'done', habitId: 'habit_1' }),
      buildEntry({ id: 'e2', date: '2026-02-10', status: 'done', habitId: 'habit_1' })
    ])

    const rate = store.completionRateForHabit(habit, '2026-02-09', '2026-02-10')

    expect(rate).toBe(100)
  })

  it('returns 0 when no entries are done', () => {
    const store = useEntriesStore()
    const habit = buildHabit({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-02-09' })
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-09', status: 'missed', habitId: 'habit_1' }),
      buildEntry({ id: 'e2', date: '2026-02-10', status: 'skipped', habitId: 'habit_1' })
    ])

    const rate = store.completionRateForHabit(habit, '2026-02-09', '2026-02-10')

    expect(rate).toBe(0)
  })
})

describe('entries store — pendingReflectionEntries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns only missed entries with missReasonCode === null', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'missed', completedAt: null, missReasonCode: null }),
      buildEntry({ id: 'e2', date: '2026-02-07', status: 'missed', completedAt: null, missReasonCode: 'forgot' }),
      buildEntry({ id: 'e3', date: '2026-02-08', status: 'done' }),
      buildEntry({ id: 'e4', date: '2026-02-09', status: 'missed', completedAt: null, missReasonCode: null })
    ])

    const pending = store.pendingReflectionEntries

    expect(pending).toHaveLength(2)
    expect(pending.every((e) => e.status === 'missed' && e.missReasonCode === null)).toBe(true)
  })

  it('sorts pending reflection entries by date descending', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'missed', completedAt: null, missReasonCode: null }),
      buildEntry({ id: 'e2', date: '2026-02-09', status: 'missed', completedAt: null, missReasonCode: null }),
      buildEntry({ id: 'e3', date: '2026-02-07', status: 'missed', completedAt: null, missReasonCode: null })
    ])

    const pending = store.pendingReflectionEntries

    expect(pending.map((e) => e.date)).toEqual(['2026-02-09', '2026-02-07', '2026-02-06'])
  })

  it('returns empty array when no pending reflections exist', () => {
    const store = useEntriesStore()

    expect(store.pendingReflectionEntries).toHaveLength(0)
  })
})

describe('entries store — entryByHabitAndDate (Map index)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('finds an entry after setStatus creates it and returns undefined after clearStatus removes it', () => {
    const store = useEntriesStore()

    // No entry yet — lookup returns undefined
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')).toBeUndefined()

    // Create via setStatus — index should reflect the addition
    store.setStatus('habit_1', '2026-02-08', 'done')
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')).not.toBeUndefined()
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')?.status).toBe('done')

    // Remove via clearStatus — index should reflect the removal
    store.clearStatus('habit_1', '2026-02-08')
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')).toBeUndefined()
  })

  it('status mutated via setStatus on an existing entry is visible through a subsequent entryByHabitAndDate call', () => {
    const store = useEntriesStore()
    store.hydrate([buildEntry({ status: 'missed', completedAt: null })])

    // Verify initial state via index
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')?.status).toBe('missed')

    // Mutate via setStatus
    store.setStatus('habit_1', '2026-02-08', 'done')

    // Map stores references — mutation must be visible through the index
    expect(store.entryByHabitAndDate('habit_1', '2026-02-08')?.status).toBe('done')
  })
})

describe('entries store — reasonDistribution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('counts entries by missReasonCode, skipping nulls', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-06', status: 'missed', completedAt: null, missReasonCode: 'forgot' }),
      buildEntry({ id: 'e2', date: '2026-02-07', status: 'missed', completedAt: null, missReasonCode: 'no_time' }),
      buildEntry({ id: 'e3', date: '2026-02-08', status: 'missed', completedAt: null, missReasonCode: 'forgot' }),
      buildEntry({ id: 'e4', date: '2026-02-09', status: 'missed', completedAt: null, missReasonCode: null })
    ])

    const dist = store.reasonDistribution()

    expect(dist).toEqual({ forgot: 2, no_time: 1 })
  })

  it('returns empty object when there are no entries', () => {
    const store = useEntriesStore()

    expect(store.reasonDistribution()).toEqual({})
  })

  it('skips entries whose missReasonCode is null', () => {
    const store = useEntriesStore()
    store.hydrate([
      buildEntry({ id: 'e1', date: '2026-02-08', status: 'missed', completedAt: null, missReasonCode: null })
    ])

    expect(store.reasonDistribution()).toEqual({})
  })
})

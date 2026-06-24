import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Habit, HabitEntry } from '~/types/app-data'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { isDateInHabitPause, isHabitDueOnDate } from '~/utils/date'
import {
  AppDataV2Schema,
  createEmptyAppData,
  migrateToV2,
  normalizeHabitPauses,
  parseAppData
} from '~/utils/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

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
    ...overrides
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
    ...overrides
  }
}

// A V1 envelope (pre-pauses). Used as migration input.
function buildV1Envelope() {
  return {
    schemaVersion: 1,
    habits: [
      {
        id: 'habit_1',
        name: 'Read',
        type: 'build',
        identityStatement: 'I am a reader.',
        scheduleWeekdays: [1, 2, 3],
        reminderTime: '08:00',
        startDate: '2026-02-01',
        archived: false,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z'
      }
    ],
    entries: [],
    suggestions: [],
    settings: {
      notificationsEnabled: false,
      dailyReviewTime: '20:00',
      weekStartsOn: 1 as const,
      primaryColor: 'emerald' as const
    }
  }
}

describe('V1 → V2 migration', () => {
  it('migrates a V1 payload by defaulting pauses and bumping the version', () => {
    const parsed = parseAppData(buildV1Envelope())

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.habits).toHaveLength(1)
    for (const habit of parsed.habits) {
      expect(habit.pauses).toEqual([])
    }
    expect(() => AppDataV2Schema.parse(parsed)).not.toThrow()
  })

  it('validates a V2 payload as-is without re-migrating', () => {
    const v2 = createEmptyAppData()
    v2.habits.push(buildHabit({ pauses: [{ start: '2026-03-01', end: '2026-03-07' }] }))

    const parsed = parseAppData(v2)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.habits[0]?.pauses).toEqual([{ start: '2026-03-01', end: '2026-03-07' }])
  })

  it('migrates a legacy payload with a missing schemaVersion', () => {
    const { schemaVersion: _omit, ...legacy } = buildV1Envelope()
    const parsed = parseAppData(legacy)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.habits[0]?.pauses).toEqual([])
  })

  it('migrateToV2 is idempotent in shape', () => {
    const once = parseAppData(buildV1Envelope())
    const twice = parseAppData(once)
    expect(twice).toEqual(once)
  })

  it('rejects an unknown schemaVersion so callers fall back to empty', () => {
    expect(() => parseAppData({ ...buildV1Envelope(), schemaVersion: 99 })).toThrow()
  })

  it('rejects a pause whose end precedes its start', () => {
    const v2 = createEmptyAppData()
    v2.habits.push(buildHabit({ pauses: [{ start: '2026-03-07', end: '2026-03-01' }] }))
    expect(() => parseAppData(v2)).toThrow()
  })

  it('rejects a pause with a non-date bound', () => {
    const v2 = createEmptyAppData()
    v2.habits.push(buildHabit({ pauses: [{ start: 'not-a-date', end: '2026-03-07' }] }))
    expect(() => parseAppData(v2)).toThrow()
  })

  it('migrates the legacy V1 fixture cleanly to V2', () => {
    const parsed = parseAppData(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')))
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.habits.every((habit) => Array.isArray(habit.pauses))).toBe(true)
  })

  it('migrateToV2 preserves entries/suggestions/settings untouched', () => {
    const v1 = buildV1Envelope()
    // migrateToV2 takes a validated V1 payload — round-trip through parse to get one.
    const migrated = migrateToV2({ ...v1 } as Parameters<typeof migrateToV2>[0])
    expect(migrated.entries).toEqual(v1.entries)
    expect(migrated.suggestions).toEqual(v1.suggestions)
    expect(migrated.settings).toEqual(v1.settings)
  })
})

describe('normalizeHabitPauses', () => {
  it('keeps valid ranges and drops invalid ones', () => {
    expect(
      normalizeHabitPauses([
        { start: '2026-03-01', end: '2026-03-07' },
        { start: '2026-03-10', end: '2026-03-01' }, // reversed → dropped
        { start: 'x', end: 'y' }, // not dates → dropped
        'nonsense'
      ])
    ).toEqual([{ start: '2026-03-01', end: '2026-03-07' }])
  })

  it('returns [] for non-array input', () => {
    expect(normalizeHabitPauses(undefined)).toEqual([])
    expect(normalizeHabitPauses(null)).toEqual([])
  })
})

describe('pause-aware due-date rule', () => {
  const habit = buildHabit({
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: '2026-02-01',
    pauses: [{ start: '2026-03-02', end: '2026-03-08' }]
  })

  it('isDateInHabitPause is inclusive on both ends', () => {
    expect(isDateInHabitPause(habit, '2026-03-02')).toBe(true)
    expect(isDateInHabitPause(habit, '2026-03-08')).toBe(true)
    expect(isDateInHabitPause(habit, '2026-03-05')).toBe(true)
    expect(isDateInHabitPause(habit, '2026-03-01')).toBe(false)
    expect(isDateInHabitPause(habit, '2026-03-09')).toBe(false)
  })

  it('paused days are not due, surrounding scheduled days are', () => {
    expect(isHabitDueOnDate(habit, '2026-03-01')).toBe(true)
    expect(isHabitDueOnDate(habit, '2026-03-05')).toBe(false)
    expect(isHabitDueOnDate(habit, '2026-03-09')).toBe(true)
  })

  it('archived short-circuits before the pause check', () => {
    const archived = buildHabit({ archived: true, pauses: [{ start: '2026-03-02', end: '2026-03-08' }] })
    expect(isHabitDueOnDate(archived, '2026-03-01')).toBe(false)
  })

  it('a pause before startDate has no effect', () => {
    const future = buildHabit({ startDate: '2026-04-01', pauses: [{ start: '2026-03-02', end: '2026-03-08' }] })
    expect(isHabitDueOnDate(future, '2026-03-05')).toBe(false) // before start anyway
    expect(isHabitDueOnDate(future, '2026-04-02')).toBe(true)
  })

  it('overlapping/adjacent pauses union together', () => {
    const overlapping = buildHabit({
      pauses: [
        { start: '2026-03-02', end: '2026-03-05' },
        { start: '2026-03-04', end: '2026-03-10' }
      ]
    })
    for (const date of ['2026-03-02', '2026-03-04', '2026-03-07', '2026-03-10']) {
      expect(isHabitDueOnDate(overlapping, date)).toBe(false)
    }
    expect(isHabitDueOnDate(overlapping, '2026-03-11')).toBe(true)
  })
})

describe('store integration with pauses', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('dueHabitsForDate excludes a habit on a paused day', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ pauses: [{ start: '2026-03-02', end: '2026-03-08' }] })])

    expect(store.dueHabitsForDate('2026-03-01').map((h) => h.id)).toEqual(['habit_1'])
    expect(store.dueHabitsForDate('2026-03-05')).toHaveLength(0)
  })

  it('ensureMissedEntries skips paused days but fills non-paused ones', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const habit = buildHabit({
      startDate: '2026-03-01',
      pauses: [{ start: '2026-03-03', end: '2026-03-05' }]
    })
    habitsStore.hydrate([habit])

    // currentDateKey = 2026-03-08, so 03-01..03-07 are historical
    entriesStore.ensureMissedEntries(habitsStore.activeHabits, '2026-03-08')

    const dates = entriesStore.entries.map((entry) => entry.date).sort()
    expect(dates).toContain('2026-03-02')
    expect(dates).not.toContain('2026-03-03')
    expect(dates).not.toContain('2026-03-04')
    expect(dates).not.toContain('2026-03-05')
    expect(dates).toContain('2026-03-06')
  })

  it('pruneMissedEntriesInPauses removes unreflected misses but preserves the rest', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    habitsStore.hydrate([buildHabit({ pauses: [{ start: '2026-03-03', end: '2026-03-05' }] })])

    entriesStore.hydrate([
      buildEntry({ id: 'e_unreflected', date: '2026-03-04', status: 'missed', missReasonCode: null }),
      buildEntry({ id: 'e_reflected', date: '2026-03-04', status: 'missed', missReasonCode: 'forgot' }),
      buildEntry({ id: 'e_done', date: '2026-03-05', status: 'done', completedAt: '2026-03-05T08:00:00.000Z' }),
      buildEntry({ id: 'e_skipped', date: '2026-03-03', status: 'skipped' }),
      buildEntry({ id: 'e_outside', date: '2026-03-09', status: 'missed', missReasonCode: null })
    ])
    coachStore.hydrate([
      {
        id: 'sug_1',
        entryId: 'e_unreflected',
        law: 'obvious',
        direction: 'increase',
        title: 't',
        action: 'a',
        rationale: 'r',
        createdAt: '2026-03-04T00:00:00.000Z'
      }
    ])

    const removed = habitsStore.pruneMissedEntriesInPauses('habit_1')

    expect(removed).toBe(1)
    const ids = entriesStore.entries.map((entry) => entry.id).sort()
    expect(ids).toEqual(['e_done', 'e_outside', 'e_reflected', 'e_skipped'])
    expect(coachStore.suggestions).toHaveLength(0) // suggestion for removed entry is cleaned up
  })

  it('completionRateForHabit ignores paused days in the denominator', () => {
    const entriesStore = useEntriesStore()
    const habit = buildHabit({
      startDate: '2026-03-01',
      pauses: [{ start: '2026-03-03', end: '2026-03-05' }]
    })

    // 2026-03-01..2026-03-06 = 6 scheduled days; 3 are paused → 3 due days.
    entriesStore.hydrate([
      buildEntry({ id: 'a', date: '2026-03-01', status: 'done', completedAt: 'x' }),
      buildEntry({ id: 'b', date: '2026-03-02', status: 'done', completedAt: 'x' }),
      buildEntry({ id: 'c', date: '2026-03-06', status: 'missed' })
    ])

    // 2 done out of 3 due days = 67%
    expect(entriesStore.completionRateForHabit(habit, '2026-03-01', '2026-03-06')).toBe(67)
  })

  it('no coaching is reconciled during a pause (no entries exist)', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    habitsStore.hydrate([
      buildHabit({ startDate: '2026-03-01', pauses: [{ start: '2026-03-01', end: '2026-03-31' }] })
    ])
    entriesStore.ensureMissedEntries(habitsStore.activeHabits, '2026-03-15')
    const created = coachStore.reconcileMissingSuggestions(habitsStore.activeHabits, entriesStore.entries)

    expect(entriesStore.entries).toHaveLength(0)
    expect(created).toBe(0)
  })

  it('createHabit and updateHabit normalize and persist pauses', () => {
    const store = useHabitsStore()
    const created = store.createHabit({
      name: 'Read',
      type: 'build',
      identityStatement: 'I am a reader.',
      scheduleWeekdays: [1, 2, 3],
      reminderTime: null,
      startDate: '2026-02-01',
      pauses: [
        { start: '2026-03-10', end: '2026-03-12' },
        { start: '2026-03-01', end: '2026-03-05' }
      ]
    })

    // sorted by start
    expect(created.pauses).toEqual([
      { start: '2026-03-01', end: '2026-03-05' },
      { start: '2026-03-10', end: '2026-03-12' }
    ])

    const updated = store.updateHabit(created.id, {
      name: 'Read',
      type: 'build',
      identityStatement: 'I am a reader.',
      scheduleWeekdays: [1, 2, 3],
      reminderTime: null,
      startDate: '2026-02-01',
      archived: false,
      pauses: [{ start: '2026-04-01', end: '2026-04-07' }]
    })

    expect(updated?.pauses).toEqual([{ start: '2026-04-01', end: '2026-04-07' }])
  })
})

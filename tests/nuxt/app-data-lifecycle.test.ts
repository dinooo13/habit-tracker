import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProxy } from 'vue'
import { useAppDataLifecycle } from '~/composables/use-app-data-lifecycle'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useSettingsStore } from '~/stores/settings'
import { APP_DATA_SCHEMA_VERSION, DEFAULT_SETTINGS } from '~/types/app-data'
import type { AppData, CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import { addDays, todayDateKey } from '~/utils/domain/date'

// Midday UTC keeps the derived local date key stable in any CI timezone.
const FROZEN_NOW = new Date('2026-07-15T12:00:00.000Z')

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Read 10 pages',
    type: 'build',
    identityStatement: 'I am a person who reads every day.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
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
    date: '2026-07-14',
    status: 'missed',
    completedAt: null,
    missReasonCode: 'forgot',
    missReasonNote: 'Overslept',
    ...overrides,
  }
}

function buildSuggestion(overrides: Partial<CoachingSuggestion> = {}): CoachingSuggestion {
  return {
    id: 'sugg_1',
    entryId: 'entry_1',
    law: 'obvious',
    direction: 'increase',
    title: 'Make it obvious',
    action: 'Lay out your book tonight.',
    rationale: 'A visible cue lowers the activation energy.',
    createdAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  }
}

function buildAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [buildHabit()],
    entries: [buildEntry()],
    suggestions: [buildSuggestion()],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  }
}

describe('useAppDataLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
    document.documentElement.removeAttribute('style')
    vi.useRealTimers()
  })

  it('snapshotAppData() stamps the schema version and mirrors the stores, proxy-free', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    habitsStore.hydrate([buildHabit()])
    entriesStore.hydrate([buildEntry()])
    coachStore.hydrate([buildSuggestion()])
    settingsStore.hydrate({ ...DEFAULT_SETTINGS })

    const { snapshotAppData } = useAppDataLifecycle()
    const snapshot = snapshotAppData()

    expect(snapshot.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(snapshot.habits).toEqual(habitsStore.snapshot())
    expect(snapshot.entries).toEqual(entriesStore.snapshot())
    expect(snapshot.suggestions).toEqual(coachStore.snapshot())
    expect(snapshot.settings).toEqual(settingsStore.snapshot())

    // Plain, structured-clonable envelope (ADR-0004).
    expect(isProxy(snapshot)).toBe(false)
    expect(isProxy(snapshot.habits)).toBe(false)
    expect(isProxy(snapshot.habits[0])).toBe(false)
    expect(() => structuredClone(snapshot)).not.toThrow()
  })

  it('replaceAppData() hydrates all four stores and applies the primary-color palette', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    const data = buildAppData({
      settings: { ...DEFAULT_SETTINGS, primaryColor: 'sky' },
    })

    const { replaceAppData } = useAppDataLifecycle()
    replaceAppData(data)

    expect(habitsStore.habits).toEqual(data.habits)
    expect(entriesStore.entries).toEqual(data.entries)
    expect(coachStore.suggestions).toEqual(data.suggestions)
    expect(settingsStore.settings).toEqual(data.settings)

    // Palette applied synchronously for the new color (sky-500 CSS custom prop).
    expect(document.documentElement.style.getPropertyValue('--ui-color-primary-500')).toBe('#0ea5e9')
  })

  it('reconcileDerivedState() backfills missed entries then reconciles suggestions', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()

    const today = todayDateKey()
    // Habit due every day, active for the last several days.
    habitsStore.hydrate([buildHabit({ startDate: addDays(today, -5) })])
    // A single pre-existing *reflected* miss (has a reason) that should drive a
    // coaching suggestion — but no suggestions seeded yet.
    entriesStore.hydrate([
      buildEntry({ id: 'entry_seed', date: addDays(today, -3), status: 'missed', missReasonCode: 'forgot' }),
    ])
    coachStore.hydrate([])

    const entriesBefore = entriesStore.entries.length

    const { reconcileDerivedState } = useAppDataLifecycle()
    reconcileDerivedState(today)

    // ensureMissedEntries backfilled the other due-but-unlogged past days.
    expect(entriesStore.entries.length).toBeGreaterThan(entriesBefore)
    // reconcileMissingSuggestions then generated suggestions for the reflected miss.
    expect(coachStore.suggestions.some(suggestion => suggestion.entryId === 'entry_seed')).toBe(true)
  })
})

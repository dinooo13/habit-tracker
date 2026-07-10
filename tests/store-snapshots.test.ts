import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isProxy } from 'vue'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useSettingsStore } from '~/stores/settings'
import { DEFAULT_SETTINGS } from '~/types/app-data'
import type { CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'

/**
 * Contract suite for the ADR-0004 "plain, proxy-free snapshot" guarantee.
 * Every persisted store's `snapshot()` must return a structured-clonable deep
 * clone that is fully detached from live reactive state, so the persistence
 * adapters never have to strip Vue proxies themselves.
 */

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [1, 3, 5],
    reminderTime: '07:00',
    startDate: '2026-02-08',
    archived: false,
    pauses: [{ start: '2026-02-10', end: '2026-02-12' }],
    createdAt: '2026-02-08T00:00:00.000Z',
    updatedAt: '2026-02-08T00:00:00.000Z',
    ...overrides,
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: '2026-02-09',
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
    action: 'Lay out your running shoes tonight.',
    rationale: 'A visible cue lowers the activation energy.',
    createdAt: '2026-02-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('store snapshots — ADR-0004 plain-data contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns proxy-free roots, records, and nested arrays for every store', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    habitsStore.hydrate([buildHabit()])
    entriesStore.hydrate([buildEntry()])
    coachStore.hydrate([buildSuggestion()])
    settingsStore.hydrate({ ...DEFAULT_SETTINGS })

    const habits = habitsStore.snapshot()
    const entries = entriesStore.snapshot()
    const suggestions = coachStore.snapshot()
    const settings = settingsStore.snapshot()

    // Roots are plain.
    expect(isProxy(habits)).toBe(false)
    expect(isProxy(entries)).toBe(false)
    expect(isProxy(suggestions)).toBe(false)
    expect(isProxy(settings)).toBe(false)

    // Top-level records are plain.
    expect(isProxy(habits[0])).toBe(false)
    expect(isProxy(entries[0])).toBe(false)
    expect(isProxy(suggestions[0])).toBe(false)

    // Nested habit arrays/ranges are plain.
    expect(isProxy(habits[0]!.scheduleWeekdays)).toBe(false)
    expect(isProxy(habits[0]!.pauses)).toBe(false)
    expect(isProxy(habits[0]!.pauses[0])).toBe(false)
  })

  it('produces snapshots that native structuredClone accepts without throwing', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    habitsStore.hydrate([buildHabit()])
    entriesStore.hydrate([buildEntry()])
    coachStore.hydrate([buildSuggestion()])
    settingsStore.hydrate({ ...DEFAULT_SETTINGS })

    expect(() => structuredClone(habitsStore.snapshot())).not.toThrow()
    expect(() => structuredClone(entriesStore.snapshot())).not.toThrow()
    expect(() => structuredClone(coachStore.snapshot())).not.toThrow()
    expect(() => structuredClone(settingsStore.snapshot())).not.toThrow()
  })

  it('detaches snapshots so mutating a snapshot does not mutate store state', () => {
    const habitsStore = useHabitsStore()
    habitsStore.hydrate([buildHabit()])

    const snapshot = habitsStore.snapshot()
    snapshot[0]!.name = 'Evening walk'
    snapshot[0]!.scheduleWeekdays.push(6)
    snapshot[0]!.pauses[0]!.end = '2026-12-31'
    snapshot[0]!.pauses.push({ start: '2026-03-01', end: '2026-03-02' })

    const stored = habitsStore.habits[0]!
    expect(stored.name).toBe('Morning run')
    expect(stored.scheduleWeekdays).toEqual([1, 3, 5])
    expect(stored.pauses).toEqual([{ start: '2026-02-10', end: '2026-02-12' }])
  })

  it('detaches snapshots so mutating store state does not mutate an earlier snapshot', () => {
    const habitsStore = useHabitsStore()
    habitsStore.hydrate([buildHabit()])

    const snapshot = habitsStore.snapshot()

    const stored = habitsStore.habits[0]!
    stored.name = 'Evening walk'
    stored.scheduleWeekdays.push(6)
    stored.pauses[0]!.end = '2026-12-31'

    expect(snapshot[0]!.name).toBe('Morning run')
    expect(snapshot[0]!.scheduleWeekdays).toEqual([1, 3, 5])
    expect(snapshot[0]!.pauses).toEqual([{ start: '2026-02-10', end: '2026-02-12' }])
  })

  it('detaches entries and coach snapshots on in-place field mutation', () => {
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    entriesStore.hydrate([buildEntry()])
    coachStore.hydrate([buildSuggestion()])

    const entrySnapshot = entriesStore.snapshot()
    const suggestionSnapshot = coachStore.snapshot()

    entriesStore.entries[0]!.status = 'done'
    coachStore.suggestions[0]!.title = 'Changed'

    expect(entrySnapshot[0]!.status).toBe('missed')
    expect(suggestionSnapshot[0]!.title).toBe('Make it obvious')
  })

  it('snapshots detach settings so mutating a snapshot does not touch store state', () => {
    const settingsStore = useSettingsStore()
    settingsStore.hydrate({ ...DEFAULT_SETTINGS })

    const snapshot = settingsStore.snapshot()
    snapshot.notificationsEnabled = !snapshot.notificationsEnabled
    snapshot.primaryColor = 'sky'

    expect(settingsStore.settings.notificationsEnabled).toBe(DEFAULT_SETTINGS.notificationsEnabled)
    expect(settingsStore.settings.primaryColor).toBe(DEFAULT_SETTINGS.primaryColor)
  })

  it('returns valid proxy-free empty/default snapshots for fresh stores', () => {
    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    const habits = habitsStore.snapshot()
    const entries = entriesStore.snapshot()
    const suggestions = coachStore.snapshot()
    const settings = settingsStore.snapshot()

    expect(habits).toEqual([])
    expect(entries).toEqual([])
    expect(suggestions).toEqual([])
    expect(settings).toEqual(DEFAULT_SETTINGS)

    expect(isProxy(habits)).toBe(false)
    expect(isProxy(entries)).toBe(false)
    expect(isProxy(suggestions)).toBe(false)
    expect(isProxy(settings)).toBe(false)
    expect(() => structuredClone(settings)).not.toThrow()
  })
})

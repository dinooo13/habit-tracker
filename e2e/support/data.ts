import type { AppData, AppSettings, CoachingSuggestion, Habit, HabitEntry } from '../../app/types/app-data'

// Deterministic, today-relative test data builders. Fixed-date fixtures
// (tests/fixtures/*.json) drift relative to "today" and make streak / insights
// assertions flaky in CI, so the data-heavy specs build their seed relative to
// the run's current date instead.

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: false,
  dailyReviewTime: '20:00',
  weekStartsOn: 1,
  primaryColor: 'emerald',
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function addDaysKey(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year!, month! - 1, day! + amount)
  return toDateKey(date)
}

export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year!, month! - 1, day!).getDay()
}

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}_e2e_${Date.now().toString(36)}_${idCounter}`
}

const ISO = '2026-01-01T00:00:00.000Z'

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  const start = overrides.startDate ?? addDaysKey(todayKey(), -30)
  return {
    id: overrides.id ?? uid('habit'),
    name: overrides.name ?? 'Read 10 pages',
    type: overrides.type ?? 'build',
    identityStatement: overrides.identityStatement ?? 'I am a daily learner.',
    scheduleWeekdays: overrides.scheduleWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
    reminderTime: overrides.reminderTime ?? '08:00',
    startDate: start,
    archived: overrides.archived ?? false,
    pauses: overrides.pauses ?? [],
    createdAt: overrides.createdAt ?? ISO,
    updatedAt: overrides.updatedAt ?? ISO,
  }
}

export function makeEntry(overrides: Partial<HabitEntry> & Pick<HabitEntry, 'habitId' | 'date' | 'status'>): HabitEntry {
  return {
    id: overrides.id ?? uid('entry'),
    habitId: overrides.habitId,
    date: overrides.date,
    status: overrides.status,
    completedAt: overrides.completedAt ?? (overrides.status === 'done' ? ISO : null),
    missReasonCode: overrides.missReasonCode ?? null,
    missReasonNote: overrides.missReasonNote ?? null,
  }
}

export function makeSuggestion(
  overrides: Partial<CoachingSuggestion> & Pick<CoachingSuggestion, 'entryId'>,
): CoachingSuggestion {
  return {
    id: overrides.id ?? uid('suggestion'),
    entryId: overrides.entryId,
    law: overrides.law ?? 'obvious',
    direction: overrides.direction ?? 'increase',
    title: overrides.title ?? 'Make it obvious',
    action: overrides.action ?? 'Leave the book on your pillow.',
    rationale: overrides.rationale ?? 'A clear cue removes the friction of remembering.',
    createdAt: overrides.createdAt ?? ISO,
  }
}

export function makeAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: 2,
    habits: overrides.habits ?? [],
    entries: overrides.entries ?? [],
    suggestions: overrides.suggestions ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(overrides.settings ?? {}) },
  }
}

/**
 * Builds a habit with a run of `done` entries on the days leading up to (and
 * including) `today`, producing a deterministic streak of `length` days.
 */
export function buildStreakData(length: number, habitOverrides: Partial<Habit> = {}): AppData {
  const habit = makeHabit({
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: addDaysKey(todayKey(), -(length + 5)),
    ...habitOverrides,
  })

  const entries: HabitEntry[] = []
  for (let offset = length - 1; offset >= 1; offset -= 1) {
    entries.push(makeEntry({ habitId: habit.id, date: addDaysKey(todayKey(), -offset), status: 'done' }))
  }

  return makeAppData({ habits: [habit], entries })
}

import type { CoachingSuggestion, Habit, HabitEntry, MissReasonCode } from '~/types/app-data'
import { addDays, compareDateKeys, dateKeyRange, isHabitDueOnDate } from '~/utils/domain/date'

/**
 * Pure, pause-aware habit-analytics derivations.
 *
 * Every function takes the raw arrays it needs (`entries` / `habits` /
 * `suggestions`) plus scalar params and builds any internal `habitId:date`
 * lookup itself — so the module is framework-independent and fully testable in
 * the fast Node `unit` project (ADR-0012). It sits in the `domain/` utility
 * category defined by ADR-0014 and imports only domain types and date helpers.
 *
 * Pause-awareness is inherited: the completion functions gate due days on
 * `isHabitDueOnDate` (already pause-aware, ADR-0010), and because paused days
 * generate no entries, {@link streakForHabit} and {@link reasonDistribution}
 * skip them naturally.
 */

function entryLookupKey(habitId: string, date: string): string {
  return `${habitId}:${date}`
}

/**
 * Build a `habitId:date → entry` index. On duplicate keys the last entry wins,
 * matching the entries store's `entryLookup` getter.
 */
function buildEntryLookup(entries: HabitEntry[]): Map<string, HabitEntry> {
  const lookup = new Map<string, HabitEntry>()
  for (const entry of entries) {
    lookup.set(entryLookupKey(entry.habitId, entry.date), entry)
  }
  return lookup
}

/**
 * Length of the current streak: consecutive `done` entries counted from the
 * habit's most recent completion. Trailing non-`done` entries are skipped
 * before counting begins, so they do not reset a run built earlier; the count
 * breaks at the first non-`done` entry encountered after counting starts.
 */
export function streakForHabit(entries: HabitEntry[], habitId: string): number {
  const habitEntries = entries
    .filter(entry => entry.habitId === habitId)
    .sort((left, right) => left.date.localeCompare(right.date))

  if (!habitEntries.length) {
    return 0
  }

  let streak = 0
  for (let index = habitEntries.length - 1; index >= 0; index -= 1) {
    const entry = habitEntries[index]
    if (!entry) {
      continue
    }

    if (entry.status === 'done') {
      streak += 1
      continue
    }

    if (streak > 0) {
      break
    }
  }

  return streak
}

/**
 * Percentage (rounded) of a single habit's due days in `[fromDate, toDate]`
 * that were completed. Paused/off-schedule days are excluded from the
 * denominator; returns `0` when the habit has no due days in the window.
 */
export function completionRateForHabit(
  habit: Habit,
  entries: HabitEntry[],
  fromDate: string,
  toDate: string,
): number {
  const dueDates = dateKeyRange(fromDate, toDate).filter(date => isHabitDueOnDate(habit, date))
  if (!dueDates.length) {
    return 0
  }

  const lookup = buildEntryLookup(entries)
  const doneCount = dueDates.filter(
    date => lookup.get(entryLookupKey(habit.id, date))?.status === 'done',
  ).length

  return Math.round((doneCount / dueDates.length) * 100)
}

/**
 * Percentage (rounded) of all due habit-days across `habits` in
 * `[fromDate, toDate]` that were completed. Returns `0` when nothing is due.
 */
export function overallCompletionRate(
  habits: Habit[],
  entries: HabitEntry[],
  fromDate: string,
  toDate: string,
): number {
  const lookup = buildEntryLookup(entries)
  let dueCount = 0
  let doneCount = 0

  for (const date of dateKeyRange(fromDate, toDate)) {
    for (const habit of habits) {
      if (!isHabitDueOnDate(habit, date)) {
        continue
      }

      dueCount += 1
      if (lookup.get(entryLookupKey(habit.id, date))?.status === 'done') {
        doneCount += 1
      }
    }
  }

  return dueCount === 0 ? 0 : Math.round((doneCount / dueCount) * 100)
}

/**
 * Percentage (rounded) of habits due on a single `date` that were completed.
 * Returns `0` when nothing is due.
 */
export function dailyCompletionRate(habits: Habit[], entries: HabitEntry[], date: string): number {
  const lookup = buildEntryLookup(entries)
  let dueCount = 0
  let doneCount = 0

  for (const habit of habits) {
    if (!isHabitDueOnDate(habit, date)) {
      continue
    }

    dueCount += 1
    if (lookup.get(entryLookupKey(habit.id, date))?.status === 'done') {
      doneCount += 1
    }
  }

  return dueCount === 0 ? 0 : Math.round((doneCount / dueCount) * 100)
}

/**
 * Distribution of miss reasons over the reflected `missed` entries, optionally
 * bounded to `[fromDate, toDate]` (both inclusive; omit a bound to leave that
 * side unbounded). Entries without a `missReasonCode` are ignored. Returns
 * `{ code, count, percent }` sorted by count descending; the human-readable
 * label is a UI concern left to the caller. `percent` is share of the total
 * within the window (rounded), `0` when the window is empty.
 */
export function reasonDistribution(
  entries: HabitEntry[],
  fromDate?: string,
  toDate?: string,
): { code: MissReasonCode, count: number, percent: number }[] {
  const distribution = new Map<MissReasonCode, number>()

  for (const entry of entries) {
    if (entry.status !== 'missed' || !entry.missReasonCode) {
      continue
    }

    if (fromDate !== undefined && compareDateKeys(entry.date, fromDate) < 0) {
      continue
    }

    if (toDate !== undefined && compareDateKeys(entry.date, toDate) > 0) {
      continue
    }

    distribution.set(entry.missReasonCode, (distribution.get(entry.missReasonCode) ?? 0) + 1)
  }

  const total = [...distribution.values()].reduce((sum, count) => sum + count, 0)

  return [...distribution.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([code, count]) => ({
      code,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    }))
}

/**
 * Inferred coaching uptake (rounded percentage). For each suggestion whose
 * source missed entry falls in `[fromDate, toDate]`, observe the window from the
 * day after that miss until either `windowDays` later or `toDate`, whichever is
 * sooner (`windowDays === null` observes through `toDate` — the "all time"
 * case). A suggestion is *observable* when that window is non-empty and
 * *improved* when the same habit was completed at least once inside it. Returns
 * the share of observable suggestions that improved, or `0` when none are
 * observable.
 */
export function coachUptake(
  suggestions: CoachingSuggestion[],
  entries: HabitEntry[],
  fromDate: string,
  toDate: string,
  windowDays: number | null,
): number {
  const lookup = buildEntryLookup(entries)
  const entriesById = new Map(entries.map(entry => [entry.id, entry]))

  const observed = suggestions
    .map(suggestion => ({ suggestion, entry: entriesById.get(suggestion.entryId) }))
    .filter((item): item is { suggestion: CoachingSuggestion, entry: HabitEntry } => {
      if (!item.entry) {
        return false
      }

      return (
        compareDateKeys(item.entry.date, fromDate) >= 0
        && compareDateKeys(item.entry.date, toDate) <= 0
      )
    })

  if (!observed.length) {
    return 0
  }

  let observableCount = 0
  let improvedCount = 0

  for (const item of observed) {
    const observationStart = addDays(item.entry.date, 1)
    const proposedEnd = windowDays === null ? toDate : addDays(item.entry.date, windowDays)
    const observationEnd = compareDateKeys(proposedEnd, toDate) > 0 ? toDate : proposedEnd

    if (compareDateKeys(observationStart, observationEnd) > 0) {
      continue
    }

    observableCount += 1

    const improved = dateKeyRange(observationStart, observationEnd).some(
      date => lookup.get(entryLookupKey(item.entry.habitId, date))?.status === 'done',
    )

    if (improved) {
      improvedCount += 1
    }
  }

  if (!observableCount) {
    return 0
  }

  return Math.round((improvedCount / observableCount) * 100)
}

import type { AppSettings } from '~/types/app-data'

/**
 * Shared weekday-order contract (issue #39).
 *
 * `weekStartsOn` is a *display* preference only: it changes the first weekday
 * shown across the dashboard calendar, the habit form's weekday selector, and
 * the habit-list schedule summary. It never changes how `Habit.scheduleWeekdays`
 * is stored — those remain canonical JS weekday numbers (0=Sun … 6=Sat), and
 * due-date/reminder/streak logic keeps using absolute weekday numbers.
 *
 * This module is the single source of truth for that ordering so the form and
 * the schedule label cannot drift into separate ordering rules again.
 */

export interface WeekdayOption {
  value: number
  label: string
}

/** Canonical weekday labels keyed by JS weekday number (0=Sun … 6=Sat). */
export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

/** Weekday options in canonical numeric order (Sunday first). */
const CANONICAL_WEEKDAY_OPTIONS: readonly WeekdayOption[] = Object.freeze(
  [0, 1, 2, 3, 4, 5, 6].map(value => ({ value, label: WEEKDAY_LABELS[value]! })),
)

/**
 * Modular display rank of a weekday relative to the configured week start.
 * The `weekStartsOn` day ranks 0, the next day ranks 1, and so on.
 */
export function weekdayRank(weekday: number, weekStartsOn: AppSettings['weekStartsOn']): number {
  return (weekday - weekStartsOn + 7) % 7
}

/**
 * The seven weekday options, ordered so the configured `weekStartsOn` day
 * comes first. Returns a fresh array; the shared canonical list is untouched.
 */
export function orderedWeekdayOptions(weekStartsOn: AppSettings['weekStartsOn']): WeekdayOption[] {
  return [...CANONICAL_WEEKDAY_OPTIONS].sort(
    (left, right) => weekdayRank(left.value, weekStartsOn) - weekdayRank(right.value, weekStartsOn),
  )
}

/**
 * Non-mutating sort of a weekday-number subset into display order, starting
 * from the configured week start. Ties (which cannot occur for unique weekdays)
 * fall back to numeric order. The input array is not modified.
 */
export function sortWeekdaysForDisplay(
  weekdays: readonly number[],
  weekStartsOn: AppSettings['weekStartsOn'],
): number[] {
  return [...weekdays].sort(
    (left, right) => weekdayRank(left, weekStartsOn) - weekdayRank(right, weekStartsOn) || left - right,
  )
}

import { parseDate } from '@internationalized/date'
import type { CalendarDate } from '@internationalized/date'
import type { Habit } from '~/types/app-data'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/

// Sane calendar bounds for any stored/imported date key. Keeps a crafted import
// (e.g. startDate "0001-01-01") from driving unbounded date-range generation
// (issue #1, SEC-09). Comfortably wider than any realistic habit history.
export const MIN_DATE_KEY = '2000-01-01'
export const MAX_DATE_KEY = '2100-12-31'

// Defensive ceiling on dateKeyRange output. Real data is bounded to
// [MIN_DATE_KEY, MAX_DATE_KEY] by the schema, so this never truncates a
// legitimate range — it only stops a pathological, non-validated input from
// freezing the tab.
export const MAX_DATE_RANGE_DAYS = 366 * 200

export function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

export function toDateKeyLocal(date: Date): string {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())

  return `${year}-${month}-${day}`
}

export function todayDateKey(): string {
  return toDateKeyLocal(new Date())
}

export function parseDateKey(dateKey: string): Date {
  const [yearPart, monthPart, dayPart] = dateKey.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return new Date(Number.NaN)
  }

  return new Date(year, month - 1, day)
}

export function formatDateKeyForLocale(
  dateKey: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  const date = parseDateKey(dateKey)
  if (Number.isNaN(date.getTime())) {
    return dateKey
  }

  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
}

export function relativeDayLabel(
  dateKey: string,
  todayKey: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
): string {
  if (dateKey === todayKey) {
    return 'Today'
  }

  if (dateKey === addDays(todayKey, -1)) {
    return 'Yesterday'
  }

  return formatDateKeyForLocale(dateKey, locale, options)
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return toDateKeyLocal(date)
}

export function compareDateKeys(left: string, right: string): number {
  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}

/**
 * True only for a real `YYYY-MM-DD` calendar date within [MIN_DATE_KEY, MAX_DATE_KEY].
 *
 * The round-trip check rejects impossible dates (e.g. `2026-02-30`, `2026-13-01`)
 * and—because JS maps `new Date(1, 0, 1)` to 1901—also rejects two-or-three-digit
 * years like `0001-01-01`. The range check rejects far-future years like `9999-12-31`.
 */
export function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_REGEX.test(dateKey)) {
    return false
  }

  const date = parseDateKey(dateKey)
  if (Number.isNaN(date.getTime()) || toDateKeyLocal(date) !== dateKey) {
    return false
  }

  return compareDateKeys(dateKey, MIN_DATE_KEY) >= 0 && compareDateKeys(dateKey, MAX_DATE_KEY) <= 0
}

export function weekdayFromDateKey(dateKey: string): number {
  return parseDateKey(dateKey).getDay()
}

/**
 * True when `dateKey` falls inside any of the habit's pause ranges (inclusive
 * on both ends). Paused days are never due (see {@link isHabitDueOnDate}).
 */
export function isDateInHabitPause(habit: Habit, dateKey: string): boolean {
  return (habit.pauses ?? []).some(
    (pause) => compareDateKeys(dateKey, pause.start) >= 0 && compareDateKeys(dateKey, pause.end) <= 0
  )
}

export function isHabitDueOnDate(habit: Habit, dateKey: string): boolean {
  if (habit.archived) {
    return false
  }

  if (compareDateKeys(dateKey, habit.startDate) < 0) {
    return false
  }

  if (!habit.scheduleWeekdays.includes(weekdayFromDateKey(dateKey))) {
    return false
  }

  // A day inside a pause range is not due, so it never generates a queue item
  // or an auto-`missed` entry (ADR-0010).
  return !isDateInHabitPause(habit, dateKey)
}

export function dateKeyRange(start: string, end: string): string[] {
  if (compareDateKeys(start, end) > 0) {
    return []
  }

  // Defense-in-depth: bound the window to the most-recent MAX_DATE_RANGE_DAYS so a
  // pathological (non-schema-validated) range can't freeze the tab (issue #1, SEC-09).
  let cursor =
    daysBetween(start, end) >= MAX_DATE_RANGE_DAYS ? addDays(end, -(MAX_DATE_RANGE_DAYS - 1)) : start

  const values: string[] = []
  while (compareDateKeys(cursor, end) <= 0) {
    values.push(cursor)
    cursor = addDays(cursor, 1)
  }

  return values
}

export function daysBetween(start: string, end: string): number {
  const startDate = parseDateKey(start)
  const endDate = parseDateKey(end)

  return Math.floor((endDate.getTime() - startDate.getTime()) / ONE_DAY_MS)
}

export function dateKeyToCalendarDate(dateKey: string): CalendarDate | null {
  try {
    return parseDate(dateKey)
  } catch {
    return null
  }
}

export function calendarDateToDateKey(value: { year: number; month: number; day: number }): string {
  return `${value.year}-${pad2(value.month)}-${pad2(value.day)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function parseTimeString(value: string | null): { hour: number; minute: number } | null {
  if (!value) {
    return null
  }

  const [hourPart, minutePart] = value.split(':')
  const hour = Number(hourPart)
  const minute = Number(minutePart)

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return { hour, minute }
}

export function formatTimeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`
}

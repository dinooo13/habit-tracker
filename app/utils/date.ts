import type { Habit } from '~/types/app-data'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

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

export function weekdayFromDateKey(dateKey: string): number {
  return parseDateKey(dateKey).getDay()
}

export function isHabitDueOnDate(habit: Habit, dateKey: string): boolean {
  if (habit.archived) {
    return false
  }

  if (compareDateKeys(dateKey, habit.startDate) < 0) {
    return false
  }

  return habit.scheduleWeekdays.includes(weekdayFromDateKey(dateKey))
}

export function dateKeyRange(start: string, end: string): string[] {
  if (compareDateKeys(start, end) > 0) {
    return []
  }

  const values: string[] = []
  let cursor = start

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

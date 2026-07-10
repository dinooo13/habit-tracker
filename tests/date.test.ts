import { describe, expect, it } from 'vitest'
import {
  calendarDateToDateKey,
  dateKeyRange,
  dateKeyToCalendarDate,
  formatDateKeyForLocale,
  isHabitDueOnDate,
  isValidDateKey,
  MAX_DATE_RANGE_DAYS,
  parseTimeString,
  relativeDayLabel,
} from '~/utils/domain/date'
import type { Habit } from '~/types/app-data'

const sampleHabit: Habit = {
  id: 'habit_1',
  name: 'Read',
  type: 'build',
  identityStatement: 'I am a reader.',
  scheduleWeekdays: [1, 3, 5],
  reminderTime: '08:15',
  startDate: '2026-02-01',
  archived: false,
  pauses: [],
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

describe('date utilities', () => {
  it('builds an inclusive date range', () => {
    expect(dateKeyRange('2026-02-01', '2026-02-03')).toEqual([
      '2026-02-01',
      '2026-02-02',
      '2026-02-03',
    ])
  })

  it('checks due schedule by weekday and start date', () => {
    expect(isHabitDueOnDate(sampleHabit, '2026-02-02')).toBe(true)
    expect(isHabitDueOnDate(sampleHabit, '2026-02-03')).toBe(false)
    expect(isHabitDueOnDate(sampleHabit, '2026-01-30')).toBe(false)
  })

  it('parses valid time strings and rejects invalid values', () => {
    expect(parseTimeString('08:15')).toEqual({ hour: 8, minute: 15 })
    expect(parseTimeString('25:99')).toBeNull()
    expect(parseTimeString(null)).toBeNull()
  })

  it('formats dates with locale language and region preferences', () => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
    const usFormatted = formatDateKeyForLocale('2026-02-08', 'en-US', options)
    const deFormatted = formatDateKeyForLocale('2026-02-08', 'en-DE', options)

    expect(usFormatted).toMatch(/^February/)
    expect(deFormatted).toMatch(/^8\b/)
    expect(deFormatted).toContain('February')
  })

  it('falls back to the raw date key when parsing fails', () => {
    expect(formatDateKeyForLocale('not-a-date', 'en-DE')).toBe('not-a-date')
  })

  it('labels today and yesterday relative to the reference date', () => {
    expect(relativeDayLabel('2026-06-14', '2026-06-14', 'en-US')).toBe('Today')
    expect(relativeDayLabel('2026-06-13', '2026-06-14', 'en-US')).toBe('Yesterday')
  })

  it('formats older days with the locale instead of a relative label', () => {
    const label = relativeDayLabel('2026-06-08', '2026-06-14', 'en-US')
    expect(label).toMatch(/^June 8/)
  })

  it('round-trips between date keys and calendar dates', () => {
    const calendarDate = dateKeyToCalendarDate('2026-06-14')
    expect(calendarDate).not.toBeNull()
    expect(calendarDate && calendarDateToDateKey(calendarDate)).toBe('2026-06-14')
  })

  it('returns null for unparseable calendar date keys', () => {
    expect(dateKeyToCalendarDate('not-a-date')).toBeNull()
  })

  it('zero-pads single-digit months and days when building a date key', () => {
    expect(calendarDateToDateKey({ year: 2026, month: 3, day: 5 })).toBe('2026-03-05')
  })
})

describe('date safety bounds (SEC-09)', () => {
  it('accepts real, in-range date keys', () => {
    expect(isValidDateKey('2026-02-01')).toBe(true)
    expect(isValidDateKey('2000-01-01')).toBe(true)
    expect(isValidDateKey('2100-12-31')).toBe(true)
  })

  it('rejects malformed, impossible, and out-of-range date keys', () => {
    expect(isValidDateKey('not-a-date')).toBe(false)
    expect(isValidDateKey('2026-2-1')).toBe(false)
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('0001-01-01')).toBe(false)
    expect(isValidDateKey('1999-12-31')).toBe(false)
    expect(isValidDateKey('9999-12-31')).toBe(false)
  })

  it('caps dateKeyRange so a pathological span cannot grow unbounded', () => {
    // ~1000-year span; the cap clamps it to the most-recent MAX_DATE_RANGE_DAYS window.
    const range = dateKeyRange('1000-01-01', '2026-06-14')
    expect(range).toHaveLength(MAX_DATE_RANGE_DAYS)
    expect(range[range.length - 1]).toBe('2026-06-14')
  })

  it('leaves a normal multi-year span untouched', () => {
    const range = dateKeyRange('2020-01-01', '2026-06-14')
    expect(range[0]).toBe('2020-01-01')
    expect(range[range.length - 1]).toBe('2026-06-14')
    expect(range.length).toBeLessThan(MAX_DATE_RANGE_DAYS)
  })
})

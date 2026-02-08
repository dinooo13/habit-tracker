import { describe, expect, it } from 'vitest'
import { dateKeyRange, formatDateKeyForLocale, isHabitDueOnDate, parseTimeString } from '~/utils/date'
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
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z'
}

describe('date utilities', () => {
  it('builds an inclusive date range', () => {
    expect(dateKeyRange('2026-02-01', '2026-02-03')).toEqual([
      '2026-02-01',
      '2026-02-02',
      '2026-02-03'
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
})

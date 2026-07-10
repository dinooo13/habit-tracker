import { describe, expect, it } from 'vitest'
import { computeBackupNudge } from '~/composables/use-backup-nudge'
import type { Habit, HabitEntry } from '~/types/app-data'
import { addDays, toDateKeyLocal } from '~/utils/date'

const TODAY = '2026-06-24'

function isoDaysAgo(days: number): string {
  // Build an ISO timestamp whose local date key is `days` before TODAY.
  return `${addDays(TODAY, -days)}T12:00:00.000Z`
}

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-01-01',
    archived: false,
    createdAt: isoDaysAgo(0),
    updatedAt: isoDaysAgo(0),
    ...overrides,
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: TODAY,
    status: 'done',
    completedAt: isoDaysAgo(0),
    missReasonCode: null,
    missReasonNote: null,
    ...overrides,
  }
}

describe('computeBackupNudge (#8)', () => {
  it('computes weeks unexported from lastExportedAt', () => {
    const result = computeBackupNudge({
      habits: [buildHabit()],
      entries: [],
      lastExportedAt: isoDaysAgo(21),
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })

    expect(result.weeksUnexported).toBe(3)
    expect(result.shouldShow).toBe(true)
  })

  it('falls back to earliest data date when never exported', () => {
    const result = computeBackupNudge({
      habits: [buildHabit({ createdAt: isoDaysAgo(35) })],
      entries: [buildEntry({ date: addDays(TODAY, -10) })],
      lastExportedAt: null,
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })

    // Earliest anchor is the 35-day-old habit createdAt → floor(35 / 7) = 5 weeks.
    expect(result.weeksUnexported).toBe(5)
    expect(result.shouldShow).toBe(true)
  })

  it('stays hidden when there are no habits', () => {
    const result = computeBackupNudge({
      habits: [],
      entries: [buildEntry({ date: addDays(TODAY, -60) })],
      lastExportedAt: null,
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })

    expect(result.shouldShow).toBe(false)
  })

  it('stays hidden below the threshold', () => {
    const result = computeBackupNudge({
      habits: [buildHabit({ createdAt: isoDaysAgo(6) })],
      entries: [],
      lastExportedAt: null,
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })

    expect(result.weeksUnexported).toBe(0)
    expect(result.shouldShow).toBe(false)
  })

  it('is suppressed while snoozed and shown after the snooze window', () => {
    const base = {
      habits: [buildHabit({ createdAt: isoDaysAgo(60) })],
      entries: [],
      lastExportedAt: null,
      todayKey: TODAY,
    }

    // Snoozed until tomorrow → suppressed (inclusive of the snooze date).
    expect(
      computeBackupNudge({ ...base, backupNudgeSnoozedUntil: addDays(TODAY, 1) }).shouldShow,
    ).toBe(false)
    // Snooze date is today → still suppressed (snooze is inclusive of its end date).
    expect(
      computeBackupNudge({ ...base, backupNudgeSnoozedUntil: TODAY }).shouldShow,
    ).toBe(false)
    // Snooze ended yesterday → shown again.
    expect(
      computeBackupNudge({ ...base, backupNudgeSnoozedUntil: addDays(TODAY, -1) }).shouldShow,
    ).toBe(true)
  })

  it('treats a future anchor as zero weeks', () => {
    const result = computeBackupNudge({
      habits: [buildHabit()],
      entries: [],
      lastExportedAt: `${addDays(TODAY, 5)}T12:00:00.000Z`,
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })

    expect(result.weeksUnexported).toBe(0)
    expect(result.shouldShow).toBe(false)
  })

  it('singular/plural message helper inputs derive from weeks', () => {
    // Sanity: one week of data anchors exactly 7 days back.
    const result = computeBackupNudge({
      habits: [buildHabit({ createdAt: isoDaysAgo(7) })],
      entries: [],
      lastExportedAt: null,
      backupNudgeSnoozedUntil: null,
      todayKey: TODAY,
    })
    expect(result.weeksUnexported).toBe(1)
    // Below threshold (2), so still hidden.
    expect(result.shouldShow).toBe(false)
    expect(toDateKeyLocal(new Date(isoDaysAgo(7)))).toBe(addDays(TODAY, -7))
  })
})

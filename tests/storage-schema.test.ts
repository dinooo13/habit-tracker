import { describe, expect, it } from 'vitest'
import type { Habit } from '~/types/app-data'
import { FIELD_LIMITS } from '~/types/app-data'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

function validHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Read',
    type: 'build',
    identityStatement: 'Reader',
    scheduleWeekdays: [1],
    reminderTime: '08:00',
    startDate: '2026-02-01',
    archived: false,
    pauses: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides
  }
}

describe('storage schema', () => {
  it('creates a valid empty payload', () => {
    const empty = createEmptyAppData()
    expect(() => parseAppData(empty)).not.toThrow()
  })

  it('rejects invalid schema versions', () => {
    const invalid = {
      ...createEmptyAppData(),
      schemaVersion: 99
    }

    expect(() => parseAppData(invalid)).toThrow()
  })

  it('fills default primaryColor for legacy payloads', () => {
    const legacyPayload = createEmptyAppData() as any
    delete legacyPayload.settings.primaryColor

    const parsed = parseAppData(legacyPayload)
    expect(parsed.settings.primaryColor).toBe('emerald')
  })

  it('defaults backup-nudge fields to null for pre-issue-#8 payloads (#8)', () => {
    const legacyPayload = createEmptyAppData() as any
    delete legacyPayload.settings.lastExportedAt
    delete legacyPayload.settings.backupNudgeSnoozedUntil

    const parsed = parseAppData(legacyPayload)
    expect(parsed.settings.lastExportedAt).toBeNull()
    expect(parsed.settings.backupNudgeSnoozedUntil).toBeNull()
  })

  it('round-trips set backup-nudge fields (#8)', () => {
    const payload = createEmptyAppData()
    payload.settings.lastExportedAt = '2026-06-01T10:00:00.000Z'
    payload.settings.backupNudgeSnoozedUntil = '2026-06-08'

    const parsed = parseAppData(payload)
    expect(parsed.settings.lastExportedAt).toBe('2026-06-01T10:00:00.000Z')
    expect(parsed.settings.backupNudgeSnoozedUntil).toBe('2026-06-08')
  })

  it('rejects an out-of-range backupNudgeSnoozedUntil date key (#8)', () => {
    const payload = createEmptyAppData()
    ;(payload.settings as any).backupNudgeSnoozedUntil = '9999-12-31'
    expect(() => parseAppData(payload)).toThrow()
  })

  it('rejects malformed habit fields', () => {
    const payload = createEmptyAppData()
    payload.habits.push({
      id: 'h1',
      name: 'Read',
      type: 'build',
      identityStatement: 'Reader',
      scheduleWeekdays: [1],
      reminderTime: '99:99',
      startDate: '2026-02-01',
      archived: false,
      pauses: [],
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z'
    })

    expect(() => parseAppData(payload)).toThrow()
  })

  it('rejects out-of-range start dates (SEC-09)', () => {
    for (const startDate of ['0001-01-01', '9999-12-31', '1999-12-31', '2026-02-30']) {
      const payload = createEmptyAppData()
      payload.habits.push(validHabit({ startDate }))
      expect(() => parseAppData(payload), startDate).toThrow()
    }
  })

  it('accepts in-range start dates', () => {
    const payload = createEmptyAppData()
    payload.habits.push(validHabit({ startDate: '2026-02-01' }))
    expect(() => parseAppData(payload)).not.toThrow()
  })

  it('rejects over-long string fields (SEC-06)', () => {
    const longName = createEmptyAppData()
    longName.habits.push(validHabit({ name: 'a'.repeat(FIELD_LIMITS.name + 1) }))
    expect(() => parseAppData(longName)).toThrow()

    const longIdentity = createEmptyAppData()
    longIdentity.habits.push(validHabit({ identityStatement: 'a'.repeat(FIELD_LIMITS.identity + 1) }))
    expect(() => parseAppData(longIdentity)).toThrow()
  })

  it('rejects an over-long missReasonNote (SEC-06)', () => {
    const payload = createEmptyAppData()
    payload.entries.push({
      id: 'e1',
      habitId: 'h1',
      date: '2026-02-01',
      status: 'missed',
      completedAt: null,
      missReasonCode: 'forgot',
      missReasonNote: 'a'.repeat(FIELD_LIMITS.note + 1)
    })
    expect(() => parseAppData(payload)).toThrow()
  })
})

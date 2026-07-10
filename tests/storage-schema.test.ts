import { describe, expect, it } from 'vitest'
import type { Habit, HabitPause } from '~/types/app-data'
import { COLLECTION_LIMITS, FIELD_LIMITS, MAX_IMPORT_FILE_BYTES } from '~/types/app-data'
import { addDays } from '~/utils/date'
import {
  assertRawHabitLimits,
  createEmptyAppData,
  normalizeHabitPauses,
  parseAppData,
} from '~/utils/storage-schema'

// Build N valid, distinct single-day pause ranges within the allowed calendar
// bounds, so a "just under the cap" payload passes full validation.
function validPauses(count: number, base = '2050-01-01'): HabitPause[] {
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(base, index)
    return { start: day, end: day }
  })
}

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
    ...overrides,
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
      schemaVersion: 99,
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
      updatedAt: '2026-02-01T00:00:00.000Z',
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
      missReasonNote: 'a'.repeat(FIELD_LIMITS.note + 1),
    })
    expect(() => parseAppData(payload)).toThrow()
  })
})

describe('import collection limits (#35)', () => {
  // The file-size gate lives inline in confirmImport() as `file.size > cap`. These
  // assert the boundary semantics of the shared constant: exact limit allowed, +1 rejected.
  it('allows a file exactly at the size limit and rejects one byte over', () => {
    expect(MAX_IMPORT_FILE_BYTES > MAX_IMPORT_FILE_BYTES).toBe(false)
    expect(MAX_IMPORT_FILE_BYTES + 1 > MAX_IMPORT_FILE_BYTES).toBe(true)
    expect(MAX_IMPORT_FILE_BYTES).toBe(64 * 1024 * 1024)
  })

  it('rejects V2 top-level collections one element over their caps', () => {
    const overHabits = { ...createEmptyAppData(), habits: new Array(COLLECTION_LIMITS.habits + 1) }
    expect(() => parseAppData(overHabits)).toThrow()

    const overEntries = { ...createEmptyAppData(), entries: new Array(COLLECTION_LIMITS.entries + 1) }
    expect(() => parseAppData(overEntries)).toThrow()

    const overSuggestions = {
      ...createEmptyAppData(),
      suggestions: new Array(COLLECTION_LIMITS.suggestions + 1),
    }
    expect(() => parseAppData(overSuggestions)).toThrow()
  })

  it('rejects V1 migration-input collections over their caps before migration', () => {
    for (const key of ['habits', 'entries', 'suggestions'] as const) {
      const payload = {
        schemaVersion: 1,
        habits: [] as unknown[],
        entries: [] as unknown[],
        suggestions: [] as unknown[],
        settings: createEmptyAppData().settings,
        [key]: new Array(COLLECTION_LIMITS[key] + 1),
      }
      expect(() => parseAppData(payload), key).toThrow()
    }
  })

  it('rejects a habit with too many raw scheduleWeekdays (strict)', () => {
    const payload = createEmptyAppData()
    payload.habits.push(validHabit({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6, 0] }))
    expect(() => parseAppData(payload)).toThrow()
  })

  it('accepts a habit with exactly seven scheduleWeekdays', () => {
    const payload = createEmptyAppData()
    payload.habits.push(validHabit({ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6] }))
    expect(() => parseAppData(payload)).not.toThrow()
  })

  it('rejects a habit with too many raw pauses (strict) and accepts one at the cap', () => {
    const over = createEmptyAppData()
    over.habits.push(validHabit({ pauses: validPauses(COLLECTION_LIMITS.pausesPerHabit + 1) }))
    expect(() => parseAppData(over)).toThrow()

    const atCap = createEmptyAppData()
    atCap.habits.push(validHabit({ pauses: validPauses(COLLECTION_LIMITS.pausesPerHabit) }))
    expect(() => parseAppData(atCap)).not.toThrow()
  })

  it('preflight rejects oversized nested arrays before element validation', () => {
    // 8 raw weekday values, some invalid/duplicate: rejected by raw count, not per-element.
    expect(() => assertRawHabitLimits([{ scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6, 99] }])).toThrow()
    // 101 raw pauses, contents never inspected.
    expect(() => assertRawHabitLimits([{ pauses: new Array(COLLECTION_LIMITS.pausesPerHabit + 1) }])).toThrow()
  })

  it('rejects a raw habit list over the cap (raw length, before dedup)', () => {
    // 501 habits that all share one ID: rejected as a unit, not deduplicated to one.
    const rawHabits = Array.from({ length: COLLECTION_LIMITS.habits + 1 }, () => ({ id: 'dup' }))
    expect(() => assertRawHabitLimits(rawHabits)).toThrow()
  })

  it('accepts a raw habit list exactly at the cap', () => {
    const rawHabits = new Array(COLLECTION_LIMITS.habits).fill({})
    expect(() => assertRawHabitLimits(rawHabits)).not.toThrow()
  })

  it('normalizeHabitPauses defensively throws on an over-limit array', () => {
    expect(() => normalizeHabitPauses(new Array(COLLECTION_LIMITS.pausesPerHabit + 1))).toThrow()
    expect(() => normalizeHabitPauses(validPauses(COLLECTION_LIMITS.pausesPerHabit))).not.toThrow()
  })
})

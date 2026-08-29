import { describe, expect, it } from 'vitest'
import type { Habit, HabitPause } from '~/types/app-data'
import { APP_DATA_SCHEMA_VERSION, COLLECTION_LIMITS, FIELD_LIMITS, MAX_IMPORT_FILE_BYTES } from '~/types/app-data'
import { addDays, todayDateKey } from '~/utils/domain/date'
import {
  assertRawHabitLimits,
  createEmptyAppData,
  normalizeHabitPauses,
  parseAppData,
  parseAppDataResult,
  parseLenientHabit,
  SCHEMA_MIGRATIONS,
} from '~/utils/persistence/storage-schema'
import { assertMigrationRegistryInvariants } from '~/utils/persistence/schema-migrations'

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

describe('parseAppDataResult — discriminated result (#68)', () => {
  it('returns ok for a current V2 payload, data deep-equal to input', () => {
    const payload = createEmptyAppData()
    const result = parseAppDataResult(payload)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      return
    }
    expect(result.sourceVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(result.data).toEqual(payload)
  })

  it('reports a present future/bogus version as unsupported-version, naming the value and range', () => {
    for (const schemaVersion of [99, 0, 1.5]) {
      const result = parseAppDataResult({ ...createEmptyAppData(), schemaVersion })
      expect(result.status, String(schemaVersion)).toBe('unrecoverable')
      if (result.status !== 'unrecoverable') {
        continue
      }
      expect(result.reason).toBe('unsupported-version')
      expect(result.message).toContain(String(schemaVersion))
      expect(result.message).toContain(`1–${APP_DATA_SCHEMA_VERSION}`)
    }
  })

  it('does not coerce a present non-numeric version to V1 (pauses cannot be silently stripped)', () => {
    // schemaVersion: '2' (string) must be unrecoverable, not migrated through V1
    // where the non-strict V1 schema would strip habits[].pauses.
    const withPauses = createEmptyAppData()
    withPauses.habits.push(validHabit({ pauses: validPauses(1) }))
    const result = parseAppDataResult({ ...withPauses, schemaVersion: '2' })

    expect(result.status).toBe('unrecoverable')
    if (result.status !== 'unrecoverable') {
      return
    }
    expect(result.reason).toBe('unsupported-version')
  })

  it('reports a malformed V2 payload as invalid-shape', () => {
    const payload = createEmptyAppData()
    payload.habits.push({ id: 'h1' } as unknown as Habit)
    const result = parseAppDataResult(payload)

    expect(result.status).toBe('unrecoverable')
    if (result.status !== 'unrecoverable') {
      return
    }
    expect(result.reason).toBe('invalid-shape')
  })

  it('reports a malformed V1 migration input as invalid-shape', () => {
    const badV1 = {
      schemaVersion: 1,
      habits: [{ id: 'h1', name: 'Read', type: 'build', identityStatement: 'Reader', scheduleWeekdays: [1], reminderTime: null, startDate: 'not-a-date', archived: false, createdAt: 'x', updatedAt: 'x' }],
      entries: [],
      suggestions: [],
      settings: createEmptyAppData().settings,
    }
    const result = parseAppDataResult(badV1)

    expect(result.status).toBe('unrecoverable')
    if (result.status !== 'unrecoverable') {
      return
    }
    expect(result.reason).toBe('invalid-shape')
  })

  it('lets the oversized preflight win over the version check', () => {
    const result = parseAppDataResult({
      schemaVersion: 99,
      habits: [],
      entries: new Array(COLLECTION_LIMITS.entries + 1),
      suggestions: [],
      settings: createEmptyAppData().settings,
    })

    expect(result.status).toBe('unrecoverable')
    if (result.status !== 'unrecoverable') {
      return
    }
    expect(result.reason).toBe('oversized')
  })

  it('never throws for hostile inputs and always yields a valid status', () => {
    const hostile: unknown[] = [null, undefined, 'str', 42, [], {}, { a: { b: { c: 1 } } }, true, Symbol.iterator]
    for (const input of hostile) {
      let result
      expect(() => {
        result = parseAppDataResult(input)
      }, String(input)).not.toThrow()
      expect(['ok', 'migrated', 'unrecoverable']).toContain(result!.status)
    }
  })

  it('parseAppData wrapper throws on unrecoverable and returns data otherwise', () => {
    expect(() => parseAppData({ ...createEmptyAppData(), schemaVersion: 99 })).toThrow()
    expect(parseAppData(createEmptyAppData()).schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
  })

  it('the shipped registry is a well-formed chain topping out at the current version', () => {
    expect(() => assertMigrationRegistryInvariants(SCHEMA_MIGRATIONS)).not.toThrow()
    const maxTo = Math.max(...[...SCHEMA_MIGRATIONS.values()].map(step => step.to))
    expect(maxTo).toBe(APP_DATA_SCHEMA_VERSION)
  })
})

describe('parseLenientHabit (#69)', () => {
  // A fully-specified, already-clean raw habit — the lenient path should pass it
  // through unchanged (a superset of the fields required to round-trip).
  const cleanRaw = {
    id: 'habit_keep',
    name: 'Read',
    type: 'build',
    identityStatement: 'I am a reader',
    scheduleWeekdays: [1, 3, 5],
    reminderTime: '08:00',
    startDate: '2026-02-01',
    archived: true,
    pauses: [{ start: '2026-03-01', end: '2026-03-02' }],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  }

  it('returns a clean habit for a fully-specified raw item, preserving id/timestamps', () => {
    const habit = parseLenientHabit(cleanRaw)
    expect(habit).toEqual(cleanRaw)
  })

  it('returns null for non-object input', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(parseLenientHabit(bad)).toBeNull()
    }
  })

  it('drops the item (null) when a required field is missing or invalid', () => {
    expect(parseLenientHabit({ ...cleanRaw, name: '   ' }), 'blank name').toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, name: 42 }), 'non-string name').toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, type: 'other' }), 'bad type').toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, identityStatement: '' }), 'blank identity').toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, scheduleWeekdays: [] }), 'empty schedule').toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, scheduleWeekdays: 'nope' }), 'non-array schedule').toBeNull()
  })

  it('drops the item when a required string field exceeds its length cap (SEC-06)', () => {
    expect(parseLenientHabit({ ...cleanRaw, name: 'a'.repeat(FIELD_LIMITS.name + 1) })).toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, identityStatement: 'a'.repeat(FIELD_LIMITS.identity + 1) })).toBeNull()
  })

  it('trims name and identityStatement', () => {
    const habit = parseLenientHabit({ ...cleanRaw, name: '  Read  ', identityStatement: '  I am a reader  ' })
    expect(habit?.name).toBe('Read')
    expect(habit?.identityStatement).toBe('I am a reader')
  })

  it('filters invalid weekdays, dedupes, and sorts', () => {
    const habit = parseLenientHabit({ ...cleanRaw, scheduleWeekdays: [5, 1, 1, 7, -1, 3.5, 3] })
    expect(habit?.scheduleWeekdays).toEqual([1, 3, 5])
  })

  it('defaults an invalid startDate to today', () => {
    expect(parseLenientHabit({ ...cleanRaw, startDate: 'not-a-date' })?.startDate).toBe(todayDateKey())
    expect(parseLenientHabit({ ...cleanRaw, startDate: '9999-12-31' })?.startDate).toBe(todayDateKey())
  })

  it('coerces an invalid reminderTime to null and keeps a valid one', () => {
    expect(parseLenientHabit({ ...cleanRaw, reminderTime: '99:99' })?.reminderTime).toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, reminderTime: 123 })?.reminderTime).toBeNull()
    expect(parseLenientHabit({ ...cleanRaw, reminderTime: '23:45' })?.reminderTime).toBe('23:45')
  })

  it('coerces a non-boolean archived to false', () => {
    expect(parseLenientHabit({ ...cleanRaw, archived: 'yes' })?.archived).toBe(false)
    expect(parseLenientHabit({ ...cleanRaw, archived: undefined })?.archived).toBe(false)
  })

  it('generates an id when missing or invalid', () => {
    const noId = parseLenientHabit({ ...cleanRaw, id: undefined })
    expect(noId?.id).toMatch(/^habit_/)
    const badId = parseLenientHabit({ ...cleanRaw, id: 'a'.repeat(FIELD_LIMITS.id + 1) })
    expect(badId?.id).toMatch(/^habit_/)
  })

  it('defaults missing createdAt/updatedAt to an ISO timestamp', () => {
    const habit = parseLenientHabit({ ...cleanRaw, createdAt: undefined, updatedAt: undefined })
    expect(habit?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(habit?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('falls back to empty pauses when the pauses array is invalid, and keeps valid ones', () => {
    expect(parseLenientHabit({ ...cleanRaw, pauses: 'nope' })?.pauses).toEqual([])
    // A reversed (invalid) range fails HabitPauseSchema, so the whole array falls
    // back to [] — the deliberate lenient-schema unification (#69).
    expect(parseLenientHabit({ ...cleanRaw, pauses: [{ start: '2026-03-05', end: '2026-03-01' }] })?.pauses).toEqual([])
    expect(parseLenientHabit({ ...cleanRaw, pauses: [{ start: '2026-03-01', end: '2026-03-02' }] })?.pauses).toEqual([
      { start: '2026-03-01', end: '2026-03-02' },
    ])
  })
})

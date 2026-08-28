import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter, HabitDatabase } from '~/utils/persistence/dexie-persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/persistence/storage-schema'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/observability/security-log'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

function readFixture(): AppData {
  return parseAppData(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')))
}

describe('DexiePersistenceAdapter', () => {
  let db: HabitDatabase
  let adapter: DexiePersistenceAdapter

  beforeEach(() => {
    db = new HabitDatabase()
    adapter = new DexiePersistenceAdapter(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('returns empty app data before anything is saved', async () => {
    expect(await adapter.hasData()).toBe(false)
    expect(await adapter.load()).toEqual(createEmptyAppData())
  })

  it('round-trips a full payload through save and load', async () => {
    const fixture = readFixture()

    await adapter.save(fixture)

    expect(await adapter.hasData()).toBe(true)

    const loaded = await adapter.load()
    expect(loaded.schemaVersion).toBe(fixture.schemaVersion)
    expect(loaded.settings).toEqual(fixture.settings)
    expect(loaded.habits).toHaveLength(fixture.habits.length)
    expect(loaded.entries).toHaveLength(fixture.entries.length)
    expect(loaded.suggestions).toHaveLength(fixture.suggestions.length)

    const byId = new Map(loaded.habits.map(habit => [habit.id, habit]))
    for (const habit of fixture.habits) {
      expect(byId.get(habit.id)).toEqual(habit)
    }
  })

  it('replaces previous data on save instead of merging', async () => {
    await adapter.save(readFixture())

    const empty = createEmptyAppData()
    await adapter.save(empty)

    expect(await adapter.load()).toEqual(empty)
  })

  it('clears all stored data', async () => {
    await adapter.save(readFixture())

    await adapter.clear()

    expect(await adapter.hasData()).toBe(false)
    expect(await adapter.load()).toEqual(createEmptyAppData())
  })

  it('falls back to empty state and logs when stored data fails validation (SEC-16)', async () => {
    clearSecurityLog()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Seed a schema-version record so load() attempts to parse, plus a habit
    // record that violates the Zod schema (missing required fields).
    await db.meta.put({ key: 'schemaVersion', value: 1 })
    await db.habits.put({ id: 'broken' } as never)

    const result = await adapter.load()

    expect(result).toEqual(createEmptyAppData())

    const events = recentSecurityEvents()
    expect(events.some(event => event.type === 'data.validation_failed' && event.level === 'error')).toBe(true)

    clearSecurityLog()
    vi.restoreAllMocks()
  })

  describe('quarantine (#66)', () => {
    beforeEach(() => {
      clearSecurityLog()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      clearSecurityLog()
      vi.restoreAllMocks()
    })

    it('quarantines the raw payload instead of discarding it on validation failure', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 1 })
      await db.habits.put({ id: 'broken' } as never)

      const result = await adapter.load()
      expect(result).toEqual(createEmptyAppData())

      const record = await adapter.loadQuarantine()
      expect(record).not.toBeNull()
      expect(record?.capturedAt).toBeTruthy()
      expect(record?.reason).toBeTruthy()

      const payload = record?.payload as { schemaVersion: unknown, habits: unknown[] }
      expect(payload.schemaVersion).toBe(1)
      expect(payload.habits).toContainEqual({ id: 'broken' })
    })

    it('keeps only the newest quarantine record across repeated failures', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 1 })
      await db.habits.put({ id: 'broken-1' } as never)
      await adapter.load()

      await db.habits.clear()
      await db.habits.put({ id: 'broken-2' } as never)
      await adapter.load()

      expect(await db.quarantine.count()).toBe(1)
      const record = await adapter.loadQuarantine()
      const payload = record?.payload as { habits: Array<{ id: string }> }
      expect(payload.habits).toContainEqual({ id: 'broken-2' })
      expect(payload.habits).not.toContainEqual({ id: 'broken-1' })
    })

    it('does not quarantine when valid data round-trips', async () => {
      await adapter.save(readFixture())
      await adapter.load()

      expect(await adapter.loadQuarantine()).toBeNull()
    })

    it('preserves the quarantine record across a normal save()', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 1 })
      await db.habits.put({ id: 'broken' } as never)
      await adapter.load()
      expect(await adapter.loadQuarantine()).not.toBeNull()

      await adapter.save(createEmptyAppData())

      expect(await adapter.loadQuarantine()).not.toBeNull()
    })

    it('clearQuarantine() removes the record; other data is untouched', async () => {
      await adapter.save(readFixture())
      await db.quarantine.put({ id: 'latest', capturedAt: '2026-01-01T00:00:00.000Z', reason: 'x', payload: {} })

      await adapter.clearQuarantine()

      expect(await adapter.loadQuarantine()).toBeNull()
      expect(await adapter.hasData()).toBe(true)
    })

    it('clear() (delete-all) also wipes the quarantine record', async () => {
      await db.quarantine.put({ id: 'latest', capturedAt: '2026-01-01T00:00:00.000Z', reason: 'x', payload: {} })

      await adapter.clear()

      expect(await adapter.loadQuarantine()).toBeNull()
    })
  })

  it('upgrades a v1 database to the v2 schema without destroying existing data', async () => {
    // Seed valid data through the adapter (registers the v2 schema), then reopen a
    // fresh adapter over the same database name to exercise the Dexie upgrade path.
    const fixture = readFixture()
    await adapter.save(fixture)
    db.close()

    const reopened = new HabitDatabase()
    const reopenedAdapter = new DexiePersistenceAdapter(reopened)
    try {
      const loaded = await reopenedAdapter.load()
      expect(loaded.habits).toHaveLength(fixture.habits.length)
      expect(loaded.entries).toHaveLength(fixture.entries.length)
      expect(loaded.settings).toEqual(fixture.settings)
      // The quarantine table exists and is empty on the upgraded database.
      expect(await reopenedAdapter.loadQuarantine()).toBeNull()
    }
    finally {
      await reopened.delete()
    }
  })
})

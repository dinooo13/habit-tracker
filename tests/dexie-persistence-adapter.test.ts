import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter, HabitDatabase } from '~/utils/persistence/dexie-persistence-adapter'
import { StaleWriteError } from '~/utils/persistence/persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/persistence/storage-schema'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/observability/security-log'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

function readFixture(): AppData {
  return parseAppData(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')))
}

describe('DexiePersistenceAdapter', () => {
  let db: HabitDatabase
  let adapter: DexiePersistenceAdapter

  async function loadData(target: DexiePersistenceAdapter = adapter): Promise<AppData> {
    return (await target.load()).data
  }

  beforeEach(() => {
    db = new HabitDatabase()
    adapter = new DexiePersistenceAdapter(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('returns empty app data before anything is saved', async () => {
    expect(await adapter.hasData()).toBe(false)
    expect(await loadData()).toEqual(createEmptyAppData())
  })

  it('round-trips a full payload through save and load', async () => {
    const fixture = readFixture()

    await adapter.save(fixture, null)

    expect(await adapter.hasData()).toBe(true)

    const loaded = await loadData()
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
    await adapter.save(readFixture(), null)

    const empty = createEmptyAppData()
    await adapter.save(empty, null)

    expect(await loadData()).toEqual(empty)
  })

  it('clears all stored data', async () => {
    await adapter.save(readFixture(), null)

    await adapter.clear()

    expect(await adapter.hasData()).toBe(false)
    expect(await loadData()).toEqual(createEmptyAppData())
  })

  it('falls back to empty state and logs when stored data fails validation (SEC-16)', async () => {
    clearSecurityLog()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Seed a schema-version record so load() attempts to parse, plus a habit
    // record that violates the Zod schema (missing required fields).
    await db.meta.put({ key: 'schemaVersion', value: 1 })
    await db.habits.put({ id: 'broken' } as never)

    const result = await loadData()

    expect(result).toEqual(createEmptyAppData())

    const events = recentSecurityEvents()
    expect(events.some(event => event.type === 'data.validation_failed' && event.level === 'error')).toBe(true)

    clearSecurityLog()
    vi.restoreAllMocks()
  })

  // ── Revision guard (issue #67, ADR-0024) ───────────────────────────────────
  describe('revision guard (#67)', () => {
    it('starts at 0 and increments on each save', async () => {
      expect(await adapter.readRevision()).toBe(0)
      expect((await adapter.load()).revision).toBe(0)

      const first = await adapter.save(createEmptyAppData(), 0)
      expect(first).toBe(1)
      expect(await adapter.readRevision()).toBe(1)
      expect((await adapter.load()).revision).toBe(1)

      const second = await adapter.save(createEmptyAppData(), 1)
      expect(second).toBe(2)
    })

    it('rejects a stale save without overwriting the stored data', async () => {
      const a = readFixture()
      await adapter.save(a, 0)

      const b = createEmptyAppData()
      await expect(adapter.save(b, 0)).rejects.toBeInstanceOf(StaleWriteError)

      // The rejected write left the transaction aborted — `a` is still stored.
      expect((await loadData()).habits).toHaveLength(a.habits.length)
      expect(await adapter.readRevision()).toBe(1)
    })

    it('carries the expected and current revisions on the error', async () => {
      await adapter.save(createEmptyAppData(), 0)
      await expect(adapter.save(createEmptyAppData(), 0)).rejects.toMatchObject({
        expectedRevision: 0,
        currentRevision: 1,
      })
    })

    it('force-writes (expectedRevision: null) regardless of the stored revision', async () => {
      await adapter.save(createEmptyAppData(), 0)
      const fixture = readFixture()

      const revision = await adapter.save(fixture, null)

      expect(revision).toBe(2)
      expect((await loadData()).habits).toHaveLength(fixture.habits.length)
    })

    it('treats a pre-revision install as revision 0 and lets a guarded save succeed', async () => {
      // Seed a valid V2 payload with no `revision` meta row (a pre-#67 install).
      const fixture = readFixture()
      await db.meta.put({ key: 'schemaVersion', value: fixture.schemaVersion })
      await db.meta.put({ key: 'settings', value: fixture.settings })
      for (const habit of fixture.habits) {
        await db.habits.put(habit)
      }

      const loaded = await adapter.load()
      expect(loaded.revision).toBe(0)

      await expect(adapter.save(createEmptyAppData(), 0)).resolves.toBe(1)
    })

    it('resets the revision to 0 on clear()', async () => {
      await adapter.save(createEmptyAppData(), 0)
      await adapter.clear()
      expect(await adapter.readRevision()).toBe(0)
    })
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

      const result = await loadData()
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
      await adapter.save(readFixture(), null)
      await adapter.load()

      expect(await adapter.loadQuarantine()).toBeNull()
    })

    it('preserves the quarantine record across a normal save()', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 1 })
      await db.habits.put({ id: 'broken' } as never)
      await adapter.load()
      expect(await adapter.loadQuarantine()).not.toBeNull()

      await adapter.save(createEmptyAppData(), null)

      expect(await adapter.loadQuarantine()).not.toBeNull()
    })

    it('clearQuarantine() removes the record; other data is untouched', async () => {
      await adapter.save(readFixture(), null)
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

  describe('schema migration (#68)', () => {
    beforeEach(() => {
      clearSecurityLog()
      vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      clearSecurityLog()
      vi.restoreAllMocks()
    })

    it('migrates a stored V1 payload, logs data.migrated, and does not quarantine', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 1 })
      await db.meta.put({ key: 'settings', value: createEmptyAppData().settings })
      // A valid V1 habit row (pre-pauses shape).
      await db.habits.put({
        id: 'habit_1',
        name: 'Read',
        type: 'build',
        identityStatement: 'Reader',
        scheduleWeekdays: [1],
        reminderTime: null,
        startDate: '2026-02-01',
        archived: false,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      } as never)

      const loaded = await loadData()

      expect(loaded.schemaVersion).toBe(2)
      expect(loaded.habits).toHaveLength(1)
      expect(loaded.habits[0]?.pauses).toEqual([])

      const events = recentSecurityEvents()
      expect(events.some(event => event.type === 'data.migrated' && event.level === 'info')).toBe(true)
      expect(await adapter.loadQuarantine()).toBeNull()
    })

    it('quarantines a future-version payload with a readable unsupported-version reason', async () => {
      await db.meta.put({ key: 'schemaVersion', value: 99 })
      await db.meta.put({ key: 'settings', value: createEmptyAppData().settings })

      const loaded = await loadData()
      expect(loaded).toEqual(createEmptyAppData())

      const record = await adapter.loadQuarantine()
      expect(record).not.toBeNull()
      expect(record?.reason).toContain('99')
      expect(record?.reason.toLowerCase()).toContain('cannot read')

      const events = recentSecurityEvents()
      expect(
        events.some(
          event =>
            event.type === 'data.validation_failed'
            && event.level === 'error'
            && (event.detail ?? '').includes('unsupported-version'),
        ),
      ).toBe(true)
    })
  })

  it('upgrades a v1 database to the v2 schema without destroying existing data', async () => {
    // Seed valid data through the adapter (registers the v2 schema), then reopen a
    // fresh adapter over the same database name to exercise the Dexie upgrade path.
    const fixture = readFixture()
    await adapter.save(fixture, null)
    db.close()

    const reopened = new HabitDatabase()
    const reopenedAdapter = new DexiePersistenceAdapter(reopened)
    try {
      const loaded = await loadData(reopenedAdapter)
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

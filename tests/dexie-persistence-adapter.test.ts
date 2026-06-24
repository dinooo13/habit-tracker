import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter, HabitDatabase } from '~/utils/dexie-persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/security-log'

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

    const byId = new Map(loaded.habits.map((habit) => [habit.id, habit]))
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
    expect(events.some((event) => event.type === 'data.validation_failed' && event.level === 'error')).toBe(true)

    clearSecurityLog()
    vi.restoreAllMocks()
  })
})

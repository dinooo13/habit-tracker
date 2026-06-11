import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDataV1 } from '~/types/app-data'
import {
  HabitDatabase,
  LEGACY_LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  clearAppData,
  hasAppData,
  loadAppData,
  migrateLegacyLocalStorage,
  saveAppData
} from '~/utils/habit-database'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

function readFixture(): AppDataV1 {
  return parseAppData(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')))
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    has: (key: string) => store.has(key)
  }
}

describe('habit database', () => {
  let db: HabitDatabase

  beforeEach(() => {
    db = new HabitDatabase()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('returns empty app data before anything is saved', async () => {
    expect(await hasAppData(db)).toBe(false)
    expect(await loadAppData(db)).toEqual(createEmptyAppData())
  })

  it('round-trips a full payload through save and load', async () => {
    const fixture = readFixture()

    await saveAppData(db, fixture)

    expect(await hasAppData(db)).toBe(true)

    const loaded = await loadAppData(db)
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
    await saveAppData(db, readFixture())

    const empty = createEmptyAppData()
    await saveAppData(db, empty)

    expect(await loadAppData(db)).toEqual(empty)
  })

  it('clears all stored data', async () => {
    await saveAppData(db, readFixture())

    await clearAppData(db)

    expect(await hasAppData(db)).toBe(false)
    expect(await loadAppData(db)).toEqual(createEmptyAppData())
  })

  it('migrates legacy localStorage data into Dexie and removes the keys', async () => {
    const fixture = readFixture()
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(fixture),
      [LEGACY_LAST_VALID_STORAGE_KEY]: JSON.stringify(fixture)
    })

    const migrated = await migrateLegacyLocalStorage(db, storage)

    expect(migrated).toBe(true)
    expect(storage.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect(storage.has(LEGACY_LAST_VALID_STORAGE_KEY)).toBe(false)

    const loaded = await loadAppData(db)
    expect(loaded.habits).toHaveLength(fixture.habits.length)
    expect(loaded.entries).toHaveLength(fixture.entries.length)
  })

  it('falls back to the last-valid legacy payload when the primary one is corrupt', async () => {
    const fixture = readFixture()
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: '{not json',
      [LEGACY_LAST_VALID_STORAGE_KEY]: JSON.stringify(fixture)
    })

    const migrated = await migrateLegacyLocalStorage(db, storage)

    expect(migrated).toBe(true)
    expect((await loadAppData(db)).habits).toHaveLength(fixture.habits.length)
  })

  it('does not overwrite existing Dexie data with legacy payloads', async () => {
    const existing = createEmptyAppData()
    await saveAppData(db, existing)

    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(readFixture())
    })

    const migrated = await migrateLegacyLocalStorage(db, storage)

    expect(migrated).toBe(false)
    expect(storage.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect(await loadAppData(db)).toEqual(existing)
  })

  it('skips migration when no legacy data exists', async () => {
    const migrated = await migrateLegacyLocalStorage(db, createMemoryStorage())

    expect(migrated).toBe(false)
    expect(await hasAppData(db)).toBe(false)
  })
})

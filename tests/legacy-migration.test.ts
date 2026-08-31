import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter, HabitDatabase } from '~/utils/persistence/dexie-persistence-adapter'
import {
  LEGACY_LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  migrateLegacyLocalStorage,
} from '~/utils/persistence/legacy-migration'
import type { PersistenceAdapter } from '~/utils/persistence/persistence-adapter'
import { StaleWriteError } from '~/utils/persistence/persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/persistence/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

function readFixture(): AppData {
  return parseAppData(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')))
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    has: (key: string) => store.has(key),
  }
}

/** Minimal in-memory adapter — proves migration is backend-independent. */
function createFakeAdapter(seed?: AppData): PersistenceAdapter {
  let data: AppData | null = seed ?? null
  let revision = 0

  return {
    load: async () => ({ data: data ?? createEmptyAppData(), revision }),
    reload: async () => ({ data: data ?? createEmptyAppData(), revision }),
    readRevision: async () => revision,
    save: async (payload, expectedRevision) => {
      if (expectedRevision !== null && expectedRevision !== revision) {
        throw new StaleWriteError(expectedRevision, revision)
      }
      data = payload
      revision += 1
      return revision
    },
    clear: async () => {
      data = null
      revision = 0
    },
    hasData: async () => data !== null,
    loadQuarantine: async () => null,
    clearQuarantine: async () => {},
  }
}

describe('migrateLegacyLocalStorage (Dexie adapter)', () => {
  let db: HabitDatabase
  let adapter: DexiePersistenceAdapter

  beforeEach(() => {
    db = new HabitDatabase()
    adapter = new DexiePersistenceAdapter(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('migrates legacy localStorage data into the backend and removes the keys', async () => {
    const fixture = readFixture()
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(fixture),
      [LEGACY_LAST_VALID_STORAGE_KEY]: JSON.stringify(fixture),
    })

    const migrated = await migrateLegacyLocalStorage(adapter, storage)

    expect(migrated).toBe(true)
    expect(storage.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect(storage.has(LEGACY_LAST_VALID_STORAGE_KEY)).toBe(false)

    const loaded = (await adapter.load()).data
    expect(loaded.habits).toHaveLength(fixture.habits.length)
    expect(loaded.entries).toHaveLength(fixture.entries.length)
  })

  it('falls back to the last-valid legacy payload when the primary one is corrupt', async () => {
    const fixture = readFixture()
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: '{not json',
      [LEGACY_LAST_VALID_STORAGE_KEY]: JSON.stringify(fixture),
    })

    const migrated = await migrateLegacyLocalStorage(adapter, storage)

    expect(migrated).toBe(true)
    expect((await adapter.load()).data.habits).toHaveLength(fixture.habits.length)
  })

  it('does not overwrite existing backend data with legacy payloads', async () => {
    const existing = createEmptyAppData()
    await adapter.save(existing, null)

    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(readFixture()),
    })

    const migrated = await migrateLegacyLocalStorage(adapter, storage)

    expect(migrated).toBe(false)
    expect(storage.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect((await adapter.load()).data).toEqual(existing)
  })

  it('skips migration when no legacy data exists', async () => {
    const migrated = await migrateLegacyLocalStorage(adapter, createMemoryStorage())

    expect(migrated).toBe(false)
    expect(await adapter.hasData()).toBe(false)
  })
})

describe('migrateLegacyLocalStorage (backend-agnostic)', () => {
  it('runs against any PersistenceAdapter implementation', async () => {
    const fixture = readFixture()
    const adapter = createFakeAdapter()
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(fixture),
    })

    const migrated = await migrateLegacyLocalStorage(adapter, storage)

    expect(migrated).toBe(true)
    expect(storage.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect((await adapter.load()).data.habits).toHaveLength(fixture.habits.length)
  })

  it('leaves a seeded adapter untouched', async () => {
    const adapter = createFakeAdapter(createEmptyAppData())
    const storage = createMemoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(readFixture()),
    })

    const migrated = await migrateLegacyLocalStorage(adapter, storage)

    expect(migrated).toBe(false)
    expect((await adapter.load()).data).toEqual(createEmptyAppData())
  })
})

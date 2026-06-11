import Dexie, { type Table } from 'dexie'
import type { AppDataV1, CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

export const DATABASE_NAME = 'habit-tracker'
export const LEGACY_STORAGE_KEY = 'habit-tracker:v1:data'
export const LEGACY_LAST_VALID_STORAGE_KEY = 'habit-tracker:v1:last-valid'

const SCHEMA_VERSION_META_KEY = 'schemaVersion'
const SETTINGS_META_KEY = 'settings'

interface MetaRecord {
  key: string
  value: unknown
}

export class HabitDatabase extends Dexie {
  habits!: Table<Habit, string>
  entries!: Table<HabitEntry, string>
  suggestions!: Table<CoachingSuggestion, string>
  meta!: Table<MetaRecord, string>

  constructor() {
    super(DATABASE_NAME)

    this.version(1).stores({
      habits: 'id, startDate',
      entries: 'id, habitId, date, status',
      suggestions: 'id, entryId, createdAt',
      meta: 'key'
    })
  }
}

function toPlainPayload(payload: AppDataV1): AppDataV1 {
  // Strips Vue reactivity proxies so IndexedDB structured cloning gets plain objects.
  return JSON.parse(JSON.stringify(payload)) as AppDataV1
}

export async function saveAppData(db: HabitDatabase, payload: AppDataV1): Promise<void> {
  const plain = toPlainPayload(payload)

  await db.transaction('rw', db.habits, db.entries, db.suggestions, db.meta, async () => {
    await Promise.all([db.habits.clear(), db.entries.clear(), db.suggestions.clear()])
    await Promise.all([
      db.habits.bulkPut(plain.habits),
      db.entries.bulkPut(plain.entries),
      db.suggestions.bulkPut(plain.suggestions),
      db.meta.bulkPut([
        { key: SCHEMA_VERSION_META_KEY, value: plain.schemaVersion },
        { key: SETTINGS_META_KEY, value: plain.settings }
      ])
    ])
  })
}

export async function hasAppData(db: HabitDatabase): Promise<boolean> {
  return Boolean(await db.meta.get(SCHEMA_VERSION_META_KEY))
}

export async function loadAppData(db: HabitDatabase): Promise<AppDataV1> {
  const [habits, entries, suggestions, schemaVersionRecord, settingsRecord] = await db.transaction(
    'r',
    [db.habits, db.entries, db.suggestions, db.meta],
    () =>
      Promise.all([
        db.habits.toArray(),
        db.entries.toArray(),
        db.suggestions.toArray(),
        db.meta.get(SCHEMA_VERSION_META_KEY),
        db.meta.get(SETTINGS_META_KEY)
      ])
  )

  if (!schemaVersionRecord) {
    return createEmptyAppData()
  }

  try {
    return parseAppData({
      schemaVersion: schemaVersionRecord.value,
      habits,
      entries,
      suggestions,
      settings: settingsRecord?.value
    })
  } catch {
    return createEmptyAppData()
  }
}

export async function clearAppData(db: HabitDatabase): Promise<void> {
  await db.transaction('rw', [db.habits, db.entries, db.suggestions, db.meta], async () => {
    await Promise.all([db.habits.clear(), db.entries.clear(), db.suggestions.clear(), db.meta.clear()])
  })
}

function readLegacyPayload(storage: Pick<Storage, 'getItem'>): AppDataV1 | null {
  for (const key of [LEGACY_STORAGE_KEY, LEGACY_LAST_VALID_STORAGE_KEY]) {
    const value = storage.getItem(key)
    if (!value) {
      continue
    }

    try {
      return parseAppData(JSON.parse(value))
    } catch {
      // Fall through to the next legacy key.
    }
  }

  return null
}

export async function migrateLegacyLocalStorage(
  db: HabitDatabase,
  storage: Pick<Storage, 'getItem' | 'removeItem'>
): Promise<boolean> {
  if (await hasAppData(db)) {
    // Already migrated (or started fresh on Dexie); drop stale legacy copies.
    storage.removeItem(LEGACY_STORAGE_KEY)
    storage.removeItem(LEGACY_LAST_VALID_STORAGE_KEY)
    return false
  }

  const legacy = readLegacyPayload(storage)
  if (!legacy) {
    return false
  }

  await saveAppData(db, legacy)
  storage.removeItem(LEGACY_STORAGE_KEY)
  storage.removeItem(LEGACY_LAST_VALID_STORAGE_KEY)
  return true
}

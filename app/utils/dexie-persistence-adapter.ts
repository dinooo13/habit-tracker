import Dexie, { type Table } from 'dexie'
import type { AppDataV1, CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import type { PersistenceAdapter } from '~/utils/persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

export const DATABASE_NAME = 'habit-tracker'

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

/**
 * IndexedDB-backed {@link PersistenceAdapter}, accessed through Dexie.
 *
 * The Dexie schema/class is an internal detail; consumers interact only via
 * the adapter interface. The database instance is injectable so tests can pass
 * a `fake-indexeddb`-backed one instead of relying on a module singleton.
 */
export class DexiePersistenceAdapter implements PersistenceAdapter {
  private readonly db: HabitDatabase

  constructor(db: HabitDatabase = new HabitDatabase()) {
    this.db = db
  }

  async save(payload: AppDataV1): Promise<void> {
    const plain = toPlainPayload(payload)
    const { db } = this

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

  async hasData(): Promise<boolean> {
    return Boolean(await this.db.meta.get(SCHEMA_VERSION_META_KEY))
  }

  async load(): Promise<AppDataV1> {
    const { db } = this
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

  async clear(): Promise<void> {
    const { db } = this
    await db.transaction('rw', [db.habits, db.entries, db.suggestions, db.meta], async () => {
      await Promise.all([db.habits.clear(), db.entries.clear(), db.suggestions.clear(), db.meta.clear()])
    })
  }
}

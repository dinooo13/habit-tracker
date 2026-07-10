import Dexie, { type Table } from 'dexie'
import type { AppData, CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import type { PersistenceAdapter } from '~/utils/persistence/persistence-adapter'
import { createEmptyAppData, parseAppData } from '~/utils/persistence/storage-schema'
import { recordSecurityEvent } from '~/utils/observability/security-log'

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

    // The Dexie *store* version is unrelated to the AppData *schema* version: the
    // V1→V2 app-data migration only adds a nested `pauses` array on each habit,
    // which is not an index, so no `version(2).stores()` bump is needed. The
    // app-data schema version lives in the `meta` table and migrations run in
    // `parseAppData` (ADR-0010).
    this.version(1).stores({
      habits: 'id, startDate',
      entries: 'id, habitId, date, status',
      suggestions: 'id, entryId, createdAt',
      meta: 'key',
    })
  }
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

  async save(payload: AppData): Promise<void> {
    // `payload` is already plain, proxy-free, structured-clonable `AppData`
    // (guaranteed by the store `snapshot()` contract — ADR-0004), so it is
    // written straight into IndexedDB with no serialization pass here.
    const { db } = this

    await db.transaction('rw', db.habits, db.entries, db.suggestions, db.meta, async () => {
      await Promise.all([db.habits.clear(), db.entries.clear(), db.suggestions.clear()])
      await Promise.all([
        db.habits.bulkPut(payload.habits),
        db.entries.bulkPut(payload.entries),
        db.suggestions.bulkPut(payload.suggestions),
        db.meta.bulkPut([
          { key: SCHEMA_VERSION_META_KEY, value: payload.schemaVersion },
          { key: SETTINGS_META_KEY, value: payload.settings },
        ]),
      ])
    })
  }

  async hasData(): Promise<boolean> {
    return Boolean(await this.db.meta.get(SCHEMA_VERSION_META_KEY))
  }

  async load(): Promise<AppData> {
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
          db.meta.get(SETTINGS_META_KEY),
        ]),
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
        settings: settingsRecord?.value,
      })
    }
    catch (error) {
      // Stored data failed Zod validation — fall back to empty state and log the
      // failure (SEC-16) so the silent reset is observable.
      recordSecurityEvent(
        'data.validation_failed',
        'error',
        error instanceof Error ? error.message : 'Stored AppData failed validation',
      )
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

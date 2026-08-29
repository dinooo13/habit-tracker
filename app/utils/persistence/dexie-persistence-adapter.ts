import Dexie, { type Table } from 'dexie'
import type { AppData, CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import type { PersistenceAdapter, QuarantineRecord } from '~/utils/persistence/persistence-adapter'
import { nowIso } from '~/utils/domain/date'
import { createEmptyAppData, parseAppDataResult } from '~/utils/persistence/storage-schema'
import { recordSecurityEvent } from '~/utils/observability/security-log'

export const DATABASE_NAME = 'habit-tracker'

const SCHEMA_VERSION_META_KEY = 'schemaVersion'
const SETTINGS_META_KEY = 'settings'

// Fixed primary key for the quarantine table so a clear-then-put keeps exactly
// one (newest-only) record — quarantined payloads consume quota, so we never
// accumulate generations (issue #66, ADR-0019).
const QUARANTINE_RECORD_KEY = 'latest'

interface MetaRecord {
  key: string
  value: unknown
}

export class HabitDatabase extends Dexie {
  habits!: Table<Habit, string>
  entries!: Table<HabitEntry, string>
  suggestions!: Table<CoachingSuggestion, string>
  meta!: Table<MetaRecord, string>
  quarantine!: Table<QuarantineRecord, string>

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

    // Store version 2 registers the `quarantine` table (issue #66, ADR-0019).
    // This is a pure *Dexie store* bump to add a table; the persisted `AppDataV2`
    // shape is unchanged, so `APP_DATA_SCHEMA_VERSION`/`migrateToV2` stay put —
    // the same store-vs-schema distinction noted on `version(1)` above. Dexie
    // treats each `version()` as the full schema, so the four existing tables'
    // index strings are repeated here verbatim. The upgrade is additive and
    // non-destructive: existing habits/entries/suggestions/meta are retained.
    this.version(2).stores({
      habits: 'id, startDate',
      entries: 'id, habitId, date, status',
      suggestions: 'id, entryId, createdAt',
      meta: 'key',
      quarantine: 'id',
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

    const rawPayload = {
      schemaVersion: schemaVersionRecord.value,
      habits,
      entries,
      suggestions,
      settings: settingsRecord?.value,
    }

    // `parseAppDataResult` never throws (issue #68, ADR-0022) — branch on the
    // discriminated status instead of a try/catch.
    const result = parseAppDataResult(rawPayload)

    switch (result.status) {
      case 'ok':
        return result.data

      case 'migrated':
        // A stored payload was upgraded to the current schema. Record it in the
        // SEC-16 buffer so a silent boot-time migration is visible when
        // debugging a report. No write happens during load(): the upgraded
        // envelope reaches disk through the normal debounced save (ADR-0004),
        // keeping the read path side-effect-free apart from quarantine.
        recordSecurityEvent('data.migrated', 'info', `Stored data migrated: ${result.steps.join(', ')}`)
        return result.data

      case 'unrecoverable':
        // Stored data could not be validated/migrated. Before falling back to
        // empty state, preserve the raw payload in the quarantine table so a
        // later save (which never touches that table) can't clobber the
        // recoverable data — the user gets an export/recover path via the
        // load-time recovery banner (issue #66, ADR-0019). Keep the SEC-16 log
        // so the reset stays observable.
        await this.quarantinePayload(rawPayload, result.message)
        recordSecurityEvent('data.validation_failed', 'error', `${result.reason}: ${result.message}`)
        return createEmptyAppData()
    }
  }

  /**
   * Write the raw, un-parseable payload into the quarantine table, keeping only
   * the newest record (clear-then-put on a fixed key). Best-effort: a quarantine
   * write failure must not mask the original validation failure, so it is caught
   * and logged rather than rethrown.
   */
  private async quarantinePayload(payload: unknown, reason: string): Promise<void> {
    try {
      const { db } = this
      await db.transaction('rw', db.quarantine, async () => {
        await db.quarantine.clear()
        await db.quarantine.put({ id: QUARANTINE_RECORD_KEY, capturedAt: nowIso(), reason, payload })
      })
    }
    catch (error) {
      recordSecurityEvent(
        'data.validation_failed',
        'warn',
        `Failed to quarantine invalid payload: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async loadQuarantine(): Promise<QuarantineRecord | null> {
    return (await this.db.quarantine.get(QUARANTINE_RECORD_KEY)) ?? null
  }

  async clearQuarantine(): Promise<void> {
    await this.db.quarantine.clear()
  }

  async clear(): Promise<void> {
    // Delete-all is a deliberate full wipe, so it clears the quarantine table too
    // — leaving an orphaned recovery banner after the user chose to erase
    // everything would be surprising (issue #66, ADR-0019).
    const { db } = this
    await db.transaction('rw', [db.habits, db.entries, db.suggestions, db.meta, db.quarantine], async () => {
      await Promise.all([
        db.habits.clear(),
        db.entries.clear(),
        db.suggestions.clear(),
        db.meta.clear(),
        db.quarantine.clear(),
      ])
    })
  }
}

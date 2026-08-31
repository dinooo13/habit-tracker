import type { AppData } from '~/types/app-data'
import type { PersistenceAdapter } from '~/utils/persistence/persistence-adapter'
import { safeJsonParse } from '~/utils/persistence/safe-json'
import { parseAppDataResult } from '~/utils/persistence/storage-schema'

export const LEGACY_STORAGE_KEY = 'habit-tracker:v1:data'
export const LEGACY_LAST_VALID_STORAGE_KEY = 'habit-tracker:v1:last-valid'

// The legacy localStorage payload is a pre-Dexie V1 envelope. `parseAppData`
// validates it as V1 and migrates it up to the current V2 shape (ADR-0010), so
// the value saved into the active backend is already V2.
function readLegacyPayload(storage: Pick<Storage, 'getItem'>): AppData | null {
  for (const key of [LEGACY_STORAGE_KEY, LEGACY_LAST_VALID_STORAGE_KEY]) {
    const value = storage.getItem(key)
    if (!value) {
      continue
    }

    // JSON.parse still throws on malformed text, so the syntax parse keeps a
    // guard; the AppData validation itself is no longer exception-driven
    // (issue #68) — an unrecoverable payload falls through to the next key.
    let parsed: unknown
    try {
      parsed = safeJsonParse(value)
    }
    catch {
      continue
    }

    const result = parseAppDataResult(parsed)
    if (result.status !== 'unrecoverable') {
      return result.data
    }
  }

  return null
}

/**
 * One-time import of a pre-Dexie `localStorage` payload into the active backend.
 *
 * Backend-agnostic: it depends only on the {@link PersistenceAdapter} contract
 * (`hasData`/`save`) plus a `Storage`, so it runs regardless of which adapter
 * is in use. Existing backend data is never overwritten — legacy keys are
 * dropped once they are no longer needed.
 *
 * @returns `true` when a legacy payload was migrated, `false` otherwise.
 */
export async function migrateLegacyLocalStorage(
  adapter: Pick<PersistenceAdapter, 'hasData' | 'save'>,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): Promise<boolean> {
  if (await adapter.hasData()) {
    // Already migrated (or started fresh on the active backend); drop stale legacy copies.
    storage.removeItem(LEGACY_STORAGE_KEY)
    storage.removeItem(LEGACY_LAST_VALID_STORAGE_KEY)
    return false
  }

  const legacy = readLegacyPayload(storage)
  if (!legacy) {
    return false
  }

  // Authoritative force-write (expectedRevision: null) — a one-time legacy
  // import into an empty backend (issue #67, ADR-0024).
  await adapter.save(legacy, null)
  storage.removeItem(LEGACY_STORAGE_KEY)
  storage.removeItem(LEGACY_LAST_VALID_STORAGE_KEY)
  return true
}

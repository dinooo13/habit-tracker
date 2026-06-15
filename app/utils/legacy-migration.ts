import type { AppDataV1 } from '~/types/app-data'
import type { PersistenceAdapter } from '~/utils/persistence-adapter'
import { safeJsonParse } from '~/utils/safe-json'
import { parseAppData } from '~/utils/storage-schema'

export const LEGACY_STORAGE_KEY = 'habit-tracker:v1:data'
export const LEGACY_LAST_VALID_STORAGE_KEY = 'habit-tracker:v1:last-valid'

function readLegacyPayload(storage: Pick<Storage, 'getItem'>): AppDataV1 | null {
  for (const key of [LEGACY_STORAGE_KEY, LEGACY_LAST_VALID_STORAGE_KEY]) {
    const value = storage.getItem(key)
    if (!value) {
      continue
    }

    try {
      return parseAppData(safeJsonParse(value))
    } catch {
      // Fall through to the next legacy key.
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
  storage: Pick<Storage, 'getItem' | 'removeItem'>
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

  await adapter.save(legacy)
  storage.removeItem(LEGACY_STORAGE_KEY)
  storage.removeItem(LEGACY_LAST_VALID_STORAGE_KEY)
  return true
}

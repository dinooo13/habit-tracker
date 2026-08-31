import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter } from '~/utils/persistence/dexie-persistence-adapter'
import { migrateLegacyLocalStorage } from '~/utils/persistence/legacy-migration'
import type { LoadedAppData, PersistenceAdapter, QuarantineRecord } from '~/utils/persistence/persistence-adapter'
import { createEmptyAppData } from '~/utils/persistence/storage-schema'

/** Empty {@link LoadedAppData} for the SSR/no-client fallback. */
function emptyLoaded(): LoadedAppData {
  return { data: createEmptyAppData(), revision: 0 }
}

let defaultAdapter: PersistenceAdapter | null = null

function getDefaultAdapter(): PersistenceAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new DexiePersistenceAdapter()
  }

  return defaultAdapter
}

/**
 * Storage orchestration seam. Depends on the {@link PersistenceAdapter}
 * interface, defaulting to the Dexie/IndexedDB backend; an alternate adapter
 * (or a fake, in tests) can be injected. The `import.meta.client` guards and
 * empty-state fallback live here, so adapters can assume a client environment.
 */
export function usePersistence(adapter: PersistenceAdapter = getDefaultAdapter()) {
  async function load(): Promise<LoadedAppData> {
    if (!import.meta.client) {
      return emptyLoaded()
    }

    await migrateLegacyLocalStorage(adapter, window.localStorage)
    return adapter.load()
  }

  /**
   * Re-read the stored envelope without the one-time legacy-`localStorage`
   * migration step (issue #67, ADR-0024). Used by the cross-tab sync to pick up
   * a peer tab's write or to fetch `theirs` for a merge.
   */
  async function reload(): Promise<LoadedAppData> {
    if (!import.meta.client) {
      return emptyLoaded()
    }

    return adapter.load()
  }

  /** Cheap stored-revision probe for the freshness check (issue #67, ADR-0024). */
  async function readRevision(): Promise<number> {
    if (!import.meta.client) {
      return 0
    }

    return adapter.readRevision()
  }

  /**
   * Persist `payload`, guarded by `expectedRevision` (issue #67, ADR-0024):
   * `null` force-writes; a number rejects with `StaleWriteError` unless the
   * stored revision still matches. Returns the new stored revision.
   */
  async function save(payload: AppData, expectedRevision: number | null): Promise<number> {
    if (!import.meta.client) {
      return 0
    }

    return adapter.save(payload, expectedRevision)
  }

  async function clear(): Promise<void> {
    if (!import.meta.client) {
      return
    }

    await adapter.clear()
  }

  async function loadQuarantine(): Promise<QuarantineRecord | null> {
    if (!import.meta.client) {
      return null
    }

    return adapter.loadQuarantine()
  }

  async function clearQuarantine(): Promise<void> {
    if (!import.meta.client) {
      return
    }

    await adapter.clearQuarantine()
  }

  return {
    load,
    reload,
    readRevision,
    save,
    clear,
    loadQuarantine,
    clearQuarantine,
  }
}

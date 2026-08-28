import type { AppData } from '~/types/app-data'
import { DexiePersistenceAdapter } from '~/utils/persistence/dexie-persistence-adapter'
import { migrateLegacyLocalStorage } from '~/utils/persistence/legacy-migration'
import type { PersistenceAdapter, QuarantineRecord } from '~/utils/persistence/persistence-adapter'
import { createEmptyAppData } from '~/utils/persistence/storage-schema'

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
  async function load(): Promise<AppData> {
    if (!import.meta.client) {
      return createEmptyAppData()
    }

    await migrateLegacyLocalStorage(adapter, window.localStorage)
    return adapter.load()
  }

  async function save(payload: AppData): Promise<void> {
    if (!import.meta.client) {
      return
    }

    await adapter.save(payload)
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
    save,
    clear,
    loadQuarantine,
    clearQuarantine,
  }
}

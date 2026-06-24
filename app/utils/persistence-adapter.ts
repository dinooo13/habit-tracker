import type { AppData } from '~/types/app-data'

/**
 * Backend-agnostic persistence contract.
 *
 * `usePersistence()` depends on this interface rather than on any concrete
 * storage technology, so an alternative backend (OPFS/SQLite-WASM, an
 * encrypted store, a sync backend) or an in-memory fake can be dropped in
 * without touching the composable's internals.
 *
 * Implementations own serialization to/from their backend but share the
 * `AppData` + Zod contract (`~/utils/storage-schema`): `load()` always
 * returns validated data, falling back to empty state when nothing is stored
 * or the stored payload is corrupt.
 */
export interface PersistenceAdapter {
  /** Read and validate the persisted payload, or empty state when absent/corrupt. */
  load(): Promise<AppData>
  /** Replace the persisted payload wholesale. */
  save(payload: AppData): Promise<void>
  /** Remove all persisted data. */
  clear(): Promise<void>
  /** Whether the backend already holds a payload (drives one-time legacy migration). */
  hasData(): Promise<boolean>
}

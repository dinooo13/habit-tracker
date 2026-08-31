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
 * `AppData` + Zod contract (`~/utils/persistence/storage-schema`): `load()` always
 * returns validated data, falling back to empty state when nothing is stored
 * or the stored payload is corrupt. When a stored payload fails validation,
 * `load()` **quarantines the raw payload** (see {@link QuarantineRecord}) instead
 * of silently discarding it, so a later save can't clobber the recoverable data
 * and the user gets an export/recover path (issue #66, ADR-0019).
 *
 * `save()` receives a **plain, proxy-free, structured-clonable `AppData`**
 * value — the store `snapshot()` contract (ADR-0004) guarantees this. Adapters
 * may rely on that precondition; they must not know about Vue reactivity or
 * sanitise proxies (no defensive JSON round-trip). They still own how that
 * plain payload maps onto their backend's storage shape.
 */
/**
 * A raw, un-parseable payload preserved when {@link PersistenceAdapter.load}
 * fails validation, so the user can export/recover it before it is overwritten
 * (issue #66, ADR-0019). This is an adapter-internal recovery artefact, not a
 * domain/`AppData` type — its `payload` is deliberately `unknown` because it did
 * not pass the Zod schema. Only the newest record is retained.
 */
export interface QuarantineRecord {
  /** Fixed key so the store keeps exactly one (newest-only) record. */
  id: string
  /** ISO timestamp of when the payload was quarantined. */
  capturedAt: string
  /** The validation error message that triggered the quarantine. */
  reason: string
  /** The raw stored envelope that failed validation. */
  payload: unknown
}

/**
 * The result of {@link PersistenceAdapter.load}: the validated app data plus the
 * revision of the payload just read. The revision is storage-level metadata
 * (a `meta` row), **not** part of `AppData` — a monotonic counter that lets a
 * later save detect that another tab moved the stored data ahead of this one
 * (issue #67, ADR-0024). `0` when nothing (or no revision) is stored.
 */
export interface LoadedAppData {
  data: AppData
  revision: number
}

/**
 * Thrown by {@link PersistenceAdapter.save} when the caller's `expectedRevision`
 * no longer matches the stored revision — another tab wrote in between. Carries
 * **only** the revisions (not the current payload): re-validating a whole
 * envelope under a write lock is avoided, and the caller has to re-`load()` for
 * the merge anyway (issue #67, ADR-0024).
 */
export class StaleWriteError extends Error {
  readonly expectedRevision: number
  readonly currentRevision: number

  constructor(expectedRevision: number, currentRevision: number) {
    super(`Stale write: expected revision ${expectedRevision}, but storage is at ${currentRevision}`)
    this.name = 'StaleWriteError'
    this.expectedRevision = expectedRevision
    this.currentRevision = currentRevision
  }
}

export interface PersistenceAdapter {
  /**
   * Read and validate the persisted payload, or empty state when absent/corrupt,
   * together with the stored {@link LoadedAppData.revision}. On a validation
   * failure the raw payload is quarantined (see {@link QuarantineRecord}) rather
   * than silently discarded, and the stored revision is still returned so a
   * subsequent save can legitimately overwrite the quarantined payload.
   */
  load(): Promise<LoadedAppData>
  /**
   * Replace the persisted payload wholesale with plain, structured-clonable
   * `AppData`, guarded by a revision compare-and-swap (issue #67, ADR-0024).
   *
   * When `expectedRevision` is a number the write is rejected with a
   * {@link StaleWriteError} unless the stored revision still equals it; on
   * success the stored revision is advanced by one. `expectedRevision === null`
   * **force-writes** — an authoritative whole-envelope replacement (import,
   * delete-all, demo, legacy migration) that adopts the new revision regardless
   * of what a peer tab did. Returns the new stored revision.
   */
  save(payload: AppData, expectedRevision: number | null): Promise<number>
  /** Cheap freshness probe: the stored revision without reading the collections. */
  readRevision(): Promise<number>
  /** Remove all persisted data (including any quarantined payload — delete-all is a full wipe; resets the revision to 0). */
  clear(): Promise<void>
  /** Whether the backend already holds a payload (drives one-time legacy migration). */
  hasData(): Promise<boolean>
  /** The newest quarantined payload preserved by a failed {@link load}, or `null`. */
  loadQuarantine(): Promise<QuarantineRecord | null>
  /** Discard the quarantined payload (the recovery banner's "Dismiss" action). */
  clearQuarantine(): Promise<void>
}

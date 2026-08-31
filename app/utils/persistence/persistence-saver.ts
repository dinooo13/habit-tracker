import type { AppData } from '~/types/app-data'
import type { LoadedAppData } from '~/utils/persistence/persistence-adapter'
import { AppDataConflictError } from '~/utils/persistence/merge-app-data'
import { MAX_SAVE_RETRIES, isQuotaExceededError, nextRetryDelay } from '~/utils/observability/storage-health'

// Injectable timer seam so the retry loop can be driven by fake timers in the
// fast `unit` project (no Nuxt runtime). Defaults to the ambient timers.
type TimerHandle = ReturnType<typeof setTimeout>

export interface PersistenceSaverDeps {
  /** Persist the given envelope; rejects on write failure. */
  save: (payload: AppData) => Promise<void>
  /** Transition the reactive status to `saving`. */
  markSaving: () => void
  /** Record a successful write (status → `ok`, stamp `lastSavedAt`). */
  markSaved: () => void
  /** Record a transient write failure (status → `failed`, surface `lastError`). */
  reportWriteFailure: (error: unknown) => void
  /** Enter terminal degraded mode (status → `unavailable`, show recovery banner). */
  markUnavailable: (reason: string) => void
  /** Run after a successful write (e.g. re-check quota). Optional. */
  onSaved?: () => void
  /**
   * A cross-tab conflict is **not** a storage failure, so it must not drive the
   * retry/backoff loop or the `unavailable` banner (issue #67, ADR-0024). When
   * `isConflictError(error)` is true the loop calls {@link onConflict}, resets,
   * and stops — mirroring the quota short-circuit. Defaults to
   * `e instanceof AppDataConflictError`.
   */
  isConflictError?: (error: unknown) => boolean
  /** Invoked once when a save fails with a conflict. Optional. */
  onConflict?: (error: unknown) => void
  /** Override the quota-error predicate (defaults to {@link isQuotaExceededError}). */
  isQuotaError?: (error: unknown) => boolean
  /** Override the backoff schedule (defaults to {@link nextRetryDelay}). */
  delayFor?: (attempt: number) => number
  /** Maximum retries before giving up (defaults to {@link MAX_SAVE_RETRIES}). */
  maxRetries?: number
  /** Timer seam for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => TimerHandle
  clearTimeoutFn?: (handle: TimerHandle) => void
}

export interface PersistenceSaver {
  /**
   * Start (or restart) a save-with-retry sequence for `payload`. A fresh call
   * supersedes any in-progress retry and resets the attempt counter — the latest
   * snapshot always wins (issue #65, Q2.3).
   */
  save: (payload: AppData) => void
  /** Cancel any scheduled retry without starting a new save. */
  cancelRetries: () => void
}

/**
 * Framework-free orchestration of the debounced save's retry/backoff loop
 * (issue #65, ADR-0017). Deliberately owns no reactive state and no timers of
 * its own beyond the injectable seam, so it unit-tests without a Nuxt runtime.
 * The 800ms edit debounce and the actual `persistence.save` binding stay at the
 * bootstrap call site (ADR-0015); this only decides *when to retry* and *when to
 * give up* once a write has been requested.
 */
export function createPersistenceSaver(deps: PersistenceSaverDeps): PersistenceSaver {
  const isQuotaError = deps.isQuotaError ?? isQuotaExceededError
  const isConflictError = deps.isConflictError ?? (error => error instanceof AppDataConflictError)
  const delayFor = deps.delayFor ?? nextRetryDelay
  const maxRetries = deps.maxRetries ?? MAX_SAVE_RETRIES
  const schedule = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = deps.clearTimeoutFn ?? ((handle: TimerHandle) => clearTimeout(handle))

  let attempt = 0
  let retryTimer: TimerHandle | null = null
  // Monotonic token so a stale in-flight promise from a superseded payload can't
  // resolve/reject into the current sequence.
  let generation = 0

  function cancelRetries(): void {
    if (retryTimer !== null) {
      cancel(retryTimer)
      retryTimer = null
    }
  }

  function run(payload: AppData, activeGeneration: number): void {
    deps.markSaving()
    deps.save(payload)
      .then(() => {
        if (activeGeneration !== generation) {
          return
        }
        attempt = 0
        deps.markSaved()
        deps.onSaved?.()
      })
      .catch((error) => {
        if (activeGeneration !== generation) {
          return
        }

        // A cross-tab conflict is not a write failure: hand it to the conflict
        // handler and stop, before touching the failure/backoff machinery
        // (issue #67, ADR-0024). `markSaved` is deliberately not called, so
        // `lastSavedAt` keeps telling the truth about the last real write.
        if (isConflictError(error)) {
          deps.onConflict?.(error)
          attempt = 0
          cancelRetries()
          return
        }

        deps.reportWriteFailure(error)

        // A full disk won't drain on retry — go straight to degraded mode so the
        // user gets the export/recovery prompt (issue #65, Q2.2).
        if (isQuotaError(error)) {
          deps.markUnavailable('quota')
          attempt = 0
          return
        }

        if (attempt < maxRetries) {
          const delay = delayFor(attempt)
          attempt += 1
          retryTimer = schedule(() => {
            retryTimer = null
            run(payload, activeGeneration)
          }, delay)
          return
        }

        deps.markUnavailable('retries-exhausted')
        attempt = 0
      })
  }

  function save(payload: AppData): void {
    cancelRetries()
    attempt = 0
    generation += 1
    run(payload, generation)
  }

  return { save, cancelRetries }
}

/** Outcome of {@link loadAppDataSafely}: the data to hydrate, its revision, and whether the read failed. */
export interface SafeLoadResult {
  data: AppData
  /** The stored cross-tab revision (issue #67, ADR-0024); `0` on a failed open. */
  revision: number
  /**
   * `true` when the underlying read threw (DB open/read failure), so the caller
   * can suppress the debounced auto-save watcher and avoid clobbering data that
   * a partially-working database might still hold (issue #66). A Zod validation
   * failure does **not** set this — that path returns valid empty data and the
   * adapter has already quarantined the raw payload.
   */
  failed: boolean
}

/**
 * Load app data, degrading to an empty-state fallback if the read throws (e.g. a
 * blocked or corrupt IndexedDB in a locked-down/private-mode browser). Marks the
 * persistence status `unavailable` on failure so the shell shows the recovery
 * banner instead of white-screening (issue #65, Q2.4), and reports `failed` so
 * bootstrap can suppress the auto-save watcher on an open failure (issue #66).
 */
export async function loadAppDataSafely(
  load: () => Promise<LoadedAppData>,
  onUnavailable: (reason: string) => void,
  fallback: () => AppData,
): Promise<SafeLoadResult> {
  try {
    const { data, revision } = await load()
    return { data, revision, failed: false }
  }
  catch {
    onUnavailable('load-failed')
    return { data: fallback(), revision: 0, failed: true }
  }
}

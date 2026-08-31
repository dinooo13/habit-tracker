import { ref, toRaw, type Ref } from 'vue'
import type { AppData } from '~/types/app-data'
import { nowIso } from '~/utils/domain/date'
import type { LoadedAppData } from '~/utils/persistence/persistence-adapter'
import { StaleWriteError } from '~/utils/persistence/persistence-adapter'
import { AppDataConflictError, mergeAppData, type AppDataConflict } from '~/utils/persistence/merge-app-data'
import { createSaveBroadcast, type BroadcastChannelLike } from '~/utils/persistence/save-broadcast'
import { createEmptyAppData } from '~/utils/persistence/storage-schema'
import {
  recordSecurityEvent,
  type SecurityEventLevel,
  type SecurityEventType,
} from '~/utils/observability/security-log'

/**
 * Cross-tab conflict protection (issue #67, ADR-0024).
 *
 * A `createCrossTabSync(deps)` factory whose state lives entirely in the
 * instance closure, plus a module-singleton `useCrossTabSync()` accessor that
 * wires the real dependencies — the `use-reminder-engine.ts` / `use-clock.ts`
 * pattern (issue #71). Injecting persistence, the broadcast channel, and the
 * store-lifecycle callbacks makes the guarded-save / merge / freshness logic
 * unit-testable without a Nuxt runtime or real IndexedDB.
 *
 * Responsibilities:
 *   - **Guarded save** — save against `knownRevision`; on a `StaleWriteError`
 *     re-load and three-way-merge (`mergeAppData`), retrying up to 3 times, and
 *     surface a real collision as an `AppDataConflictError` + `conflict` state.
 *   - **Authoritative save** — force-write (import / delete-all / demo), adopting
 *     the returned revision.
 *   - **Stay fresh** — a clean, idle tab re-hydrates on a peer broadcast, on
 *     focus/visibility, and on a visible-only poll; a dirty tab defers to the
 *     guard so in-flight edits are never discarded.
 */

const MAX_MERGE_ATTEMPTS = 3
const DEFAULT_INTERVAL_MS = 30_000

export interface CrossTabSyncDeps {
  /** Re-read the stored envelope (no legacy migration). */
  loadFresh: () => Promise<LoadedAppData>
  /** Cheap stored-revision probe. */
  readRevision: () => Promise<number>
  /** Persist guarded by `expectedRevision` (`null` force-writes). Returns the new revision. */
  saveEnvelope: (payload: AppData, expectedRevision: number | null) => Promise<number>
  /** Replace all app data and cancel any pending debounced save (breaks the echo loop). */
  applyRemote: (data: AppData) => void
  /** Regenerate runtime-only derived state after applying a merged envelope. */
  reconcile: () => void
  /** Build the current persist envelope from the stores. */
  snapshot: () => AppData
  /** Whether this tab has an unsaved edit pending (bootstrap: `pendingPayload !== null`). */
  isDirty: () => boolean
  /** Whether freshness/remote applies are suspended (e.g. a failed IndexedDB open). Optional. */
  isSuspended?: () => boolean
  /** Poll cadence in ms (default 30s). */
  intervalMs?: number
  /** Broadcast-channel factory seam. */
  createChannel?: () => BroadcastChannelLike | null
  /** Security-event sink (default {@link recordSecurityEvent}). */
  logEvent?: (type: SecurityEventType, level: SecurityEventLevel, detail?: string) => void
}

export interface CrossTabSync {
  /** Non-null ⇒ auto-save suspended, conflict banner shown. `[]` is the livelock guard. */
  conflict: Ref<AppDataConflict[] | null>
  /** ISO timestamp of the last silent remote apply; drives the "Updated from another tab" pill. */
  lastRemoteAppliedAt: Ref<string | null>
  /** Adopt the revision + base observed at load. */
  prime: (base: AppData, revision: number) => void
  /** The bootstrap save path — guarded, merges on a stale write, throws on a real collision. */
  saveGuarded: (payload: AppData) => Promise<void>
  /** A deliberate whole-envelope replacement — force-writes and adopts the new revision. */
  saveAuthoritative: (payload: AppData) => Promise<number>
  /** Single guarded attempt with no merge/retry, for the teardown flush. Returns whether it wrote. */
  saveFinal: (payload: AppData) => Promise<boolean>
  /** Re-hydrate if the stored revision moved ahead and this tab is clean. */
  checkFreshness: () => Promise<void>
  /** The revision this tab last observed or wrote. */
  currentRevision: () => number
  start: () => void
  stop: () => void
}

export function createCrossTabSync(deps: CrossTabSyncDeps): CrossTabSync {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
  const log = deps.logEvent ?? recordSecurityEvent

  const conflict = ref<AppDataConflict[] | null>(null)
  const lastRemoteAppliedAt = ref<string | null>(null)

  let knownRevision = 0
  let base: AppData | null = null

  let started = false
  let interval: ReturnType<typeof setInterval> | null = null
  let visibilityHandler: (() => void) | null = null
  let focusHandler: (() => void) | null = null

  const broadcast = createSaveBroadcast({
    onSaved: (revision) => {
      // Ignore peer pings we've already caught up to; otherwise probe/refresh.
      if (revision <= knownRevision) {
        return
      }
      void checkFreshness()
    },
    createChannel: deps.createChannel,
  })

  function enterConflict(conflicts: AppDataConflict[]): void {
    conflict.value = conflicts
    log(
      'storage.conflict_detected',
      'warn',
      conflicts.length ? `${conflicts.length} record(s) changed in another tab` : 'Cross-tab conflict (merge livelock)',
    )
  }

  /**
   * The merge ancestor must be an immutable, independent copy: the four Pinia
   * stores `hydrate()` by sharing the incoming record objects (a shallow array
   * copy — ADR-0004/ADR-0015), so any data object that is also handed to
   * `replaceAppData` still shares its habit/entry objects with the reactive
   * store. Holding that object directly as `base` let a later in-place edit
   * (e.g. `habit.name = …`) mutate the ancestor, collapsing the three-way merge
   * to a two-way one that can never see a same-record collision (issue #67). So
   * every `base` assignment goes through a structural clone that no store shares.
   */
  function detach(data: AppData): AppData {
    return structuredClone(toRaw(data))
  }

  function prime(baseData: AppData, revision: number): void {
    base = detach(baseData)
    knownRevision = revision
  }

  async function saveGuarded(payload: AppData): Promise<void> {
    let ours = payload

    for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt++) {
      try {
        const revision = await deps.saveEnvelope(ours, knownRevision)
        base = detach(ours)
        knownRevision = revision
        broadcast.post(revision)
        return
      }
      catch (error) {
        if (!(error instanceof StaleWriteError)) {
          // A genuine storage failure — let the saver's retry/backoff handle it.
          throw error
        }

        const fresh = await deps.loadFresh()
        const ancestor = base ?? createEmptyAppData()
        const result = mergeAppData(ancestor, ours, fresh.data)

        if (result.status === 'conflict') {
          enterConflict(result.conflicts)
          throw new AppDataConflictError(result.conflicts)
        }

        // Apply the merged envelope, regenerate any orphaned derived state, and
        // re-snapshot so the retry saves the merged result at the freshly-seen
        // revision. `applyRemote` cancels the echoed debounced save.
        deps.applyRemote(result.data)
        deps.reconcile()
        base = detach(fresh.data)
        knownRevision = fresh.revision
        ours = deps.snapshot()
        log('storage.conflict_merged', 'info', `Merged a stale save onto revision ${fresh.revision}`)
      }
    }

    // Bounded-livelock guard: repeated stale writes degrade to the conflict UI
    // rather than spinning forever.
    enterConflict([])
    throw new AppDataConflictError([])
  }

  async function saveAuthoritative(payload: AppData): Promise<number> {
    const revision = await deps.saveEnvelope(payload, null)
    base = detach(payload)
    knownRevision = revision
    broadcast.post(revision)
    return revision
  }

  async function saveFinal(payload: AppData): Promise<boolean> {
    try {
      const revision = await deps.saveEnvelope(payload, knownRevision)
      base = detach(payload)
      knownRevision = revision
      broadcast.post(revision)
      return true
    }
    catch (error) {
      if (error instanceof StaleWriteError) {
        // Teardown flush: a stale write is simply not written — strictly better
        // than clobbering the peer's newer data (issue #67, ADR-0024).
        return false
      }
      throw error
    }
  }

  async function checkFreshness(): Promise<void> {
    // Inert while a conflict is unresolved or storage is suspended.
    if (conflict.value !== null || deps.isSuspended?.()) {
      return
    }

    const stored = await deps.readRevision()
    if (stored <= knownRevision) {
      return
    }

    // A dirty tab defers to the guarded save (which will merge) so unsaved
    // edits are never discarded.
    if (deps.isDirty()) {
      return
    }

    const fresh = await deps.loadFresh()
    deps.applyRemote(fresh.data)
    base = detach(fresh.data)
    knownRevision = fresh.revision
    lastRemoteAppliedAt.value = nowIso()
  }

  function armInterval(): void {
    if (interval || !import.meta.client) {
      return
    }
    interval = setInterval(() => {
      void checkFreshness()
    }, intervalMs)
  }

  function clearIntervalTimer(): void {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  function start(): void {
    if (!import.meta.client || started) {
      return
    }
    started = true

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        armInterval()
        void checkFreshness()
      }
      else {
        // Background timers are throttled and a hidden tab has nothing to show.
        clearIntervalTimer()
      }
    }
    focusHandler = () => {
      void checkFreshness()
    }

    document.addEventListener('visibilitychange', visibilityHandler)
    window.addEventListener('focus', focusHandler)

    if (document.visibilityState === 'visible') {
      armInterval()
    }
    void checkFreshness()
  }

  function stop(): void {
    clearIntervalTimer()
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    if (focusHandler) {
      window.removeEventListener('focus', focusHandler)
      focusHandler = null
    }
    broadcast.close()
    started = false
  }

  return {
    conflict,
    lastRemoteAppliedAt,
    prime,
    saveGuarded,
    saveAuthoritative,
    saveFinal,
    checkFreshness,
    currentRevision: () => knownRevision,
    start,
    stop,
  }
}

let instance: CrossTabSync | null = null

/**
 * Build the real instance and register it as the module singleton. Bootstrap
 * calls this once with the store-lifecycle callbacks it owns (the debounce
 * cancel, the dirty check); every other caller then shares it via
 * {@link useCrossTabSync}.
 */
export function provideCrossTabSync(deps: CrossTabSyncDeps): CrossTabSync {
  instance = createCrossTabSync(deps)
  return instance
}

/** Deps used when nothing registered an instance (component tests, edge cases). */
function defaultDeps(): CrossTabSyncDeps {
  const persistence = usePersistence()
  const lifecycle = useAppDataLifecycle()
  return {
    loadFresh: () => persistence.reload(),
    readRevision: () => persistence.readRevision(),
    saveEnvelope: (payload, expectedRevision) => persistence.save(payload, expectedRevision),
    applyRemote: data => lifecycle.replaceAppData(data),
    reconcile: () => {
      lifecycle.reconcileDerivedState()
    },
    snapshot: () => lifecycle.snapshotAppData(),
    isDirty: () => false,
  }
}

/**
 * Module-singleton accessor. Returns the instance bootstrap registered, or lazily
 * builds a default one so components (`settings.vue`, the status indicator) and
 * the demo loader can reach `saveAuthoritative` / `conflict` before or without a
 * full bootstrap.
 */
export function useCrossTabSync(): CrossTabSync {
  return (instance ??= createCrossTabSync(defaultDeps()))
}

/** Tear down and clear the singleton — for test isolation in the shared Nuxt runtime. */
export function resetCrossTabSync(): void {
  instance?.stop()
  instance = null
}

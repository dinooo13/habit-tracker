import { nextTick, watch } from 'vue'
import type { AppData } from '~/types/app-data'
import { todayDateKey } from '~/utils/domain/date'
import { createEmptyAppData } from '~/utils/persistence/storage-schema'
import { createPersistenceSaver, loadAppDataSafely } from '~/utils/persistence/persistence-saver'
import { applyPrimaryColorPalette } from '~/utils/ui/primary-color'

/**
 * Ask the browser to make our IndexedDB data persistent (not evictable under
 * pressure), recording the resolved grant into storage-health for the
 * diagnostics panel (issue #73). Best-effort: unsupported/blocked → `false`.
 */
function requestPersistentStorage(setPersisted: (value: boolean) => void): void {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return
  }

  navigator.storage
    .persisted()
    .then(persisted => (persisted ? true : navigator.storage.persist()))
    .then(result => setPersisted(result))
    .catch(() => setPersisted(false))
}

export default defineNuxtPlugin(async () => {
  const persistence = usePersistence()
  const storageHealth = useStorageHealth()
  const dataRecovery = useDataRecovery()

  requestPersistentStorage(result => storageHealth.setPersisted(result))

  // Best-effort quota pre-check at startup (SEC-18). Non-fatal when unavailable.
  void storageHealth.checkQuota()

  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()
  const settingsStore = useSettingsStore()
  const lifecycle = useAppDataLifecycle()

  // A blocked/corrupt IndexedDB (private mode, locked-down browser) must not
  // white-screen the app — degrade to empty state and mark storage unavailable
  // so the shell shows the recovery banner (issue #65, Q2.4).
  const { data: loaded, revision: loadedRevision, failed: loadFailed } = await loadAppDataSafely(
    () => persistence.load(),
    reason => storageHealth.markUnavailable(reason),
    createEmptyAppData,
  )
  lifecycle.replaceAppData(loaded)
  storageHealth.recordReconcile(lifecycle.reconcileDerivedState(todayDateKey()))

  // Pick up any quarantined payload preserved by a failed validation on load —
  // from this session or a prior one — so the recovery banner can offer export /
  // dismiss (issue #66, ADR-0019). Best-effort; never blocks startup.
  void dataRecovery.refresh()

  watch(
    () => settingsStore.primaryColor,
    (value) => {
      applyPrimaryColorPalette(value)
    },
  )

  let pendingPayload: AppData | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function cancelPendingSave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    pendingPayload = null
  }

  // Cross-tab conflict protection (issue #67, ADR-0024). Owns the revision guard,
  // the deterministic merge, and the freshness refresh; the 800ms edit debounce
  // and the store-lifecycle callbacks it needs (cancel the echoed save, is this
  // tab dirty) stay here (ADR-0015). Registered as the singleton so `settings.vue`,
  // the demo loader, and the status indicator share this instance.
  const sync = provideCrossTabSync({
    loadFresh: () => persistence.reload(),
    readRevision: () => persistence.readRevision(),
    saveEnvelope: (payload, expectedRevision) => persistence.save(payload, expectedRevision),
    applyRemote: (data) => {
      lifecycle.replaceAppData(data)
      // replaceAppData's mutations trip the deep watcher below and queue a save;
      // cancel it on nextTick (after the watcher flushes) so an applied remote
      // envelope doesn't echo straight back out.
      void nextTick(() => {
        cancelPendingSave()
      })
    },
    reconcile: () => {
      storageHealth.recordReconcile(lifecycle.reconcileDerivedState())
    },
    snapshot: () => lifecycle.snapshotAppData(),
    isDirty: () => pendingPayload !== null,
    isSuspended: () => loadFailed,
  })
  sync.prime(loaded, loadedRevision)

  // The retry/backoff loop lives in a framework-free saver (ADR-0017); the save
  // itself now goes through the revision-guarded cross-tab path (issue #67).
  const saver = createPersistenceSaver({
    save: payload => sync.saveGuarded(payload),
    markSaving: () => storageHealth.markSaving(),
    markSaved: () => storageHealth.markSaved(),
    reportWriteFailure: error => storageHealth.reportWriteFailure(error),
    markUnavailable: reason => storageHealth.markUnavailable(reason),
    // Re-check quota after a successful large write (SEC-18).
    onSaved: () => {
      void storageHealth.checkQuota()
    },
    // A cross-tab conflict is surfaced by `sync` (banner + suspended auto-save);
    // the saver only needs to not treat it as a storage failure.
    onConflict: () => {},
  })

  function flushPendingSave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!pendingPayload) {
      return
    }
    const payload = pendingPayload
    pendingPayload = null
    saver.save(payload)
  }

  // Best-effort final flush on teardown: the page may be unloading, so we can't
  // await a backoff loop or a merge — one guarded save, no retries (issue #65,
  // Q2.5). A stale write on teardown is simply not written, which is strictly
  // better than clobbering a peer tab's newer data (issue #67, ADR-0024).
  function finalFlush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    saver.cancelRetries()
    if (!pendingPayload) {
      return
    }
    const payload = pendingPayload
    pendingPayload = null
    if (loadFailed || sync.conflict.value !== null) {
      return
    }
    storageHealth.markSaving()
    sync
      .saveFinal(payload)
      .then((written) => {
        if (written) {
          storageHealth.markSaved()
        }
      })
      .catch(error => storageHealth.reportWriteFailure(error))
  }

  // Deep-watch the *live* reactive store state so Vue's traversal collects
  // dependencies on nested, in-place mutations (e.g. `habit.name = ...`). The
  // plain, proxy-free `AppData` payload is built from the stores' `snapshot()`
  // results inside the callback — serialization is a store concern, reactive
  // tracking a bootstrap concern (ADR-0004). Watching the detached snapshots
  // instead would break dependency collection.
  watch(
    () => [habitsStore.habits, entriesStore.entries, coachStore.suggestions, settingsStore.settings],
    () => {
      // Read-only in-memory mode after an IndexedDB open failure (issue #66): the
      // DB might be partially working, so an idle-edit auto-save that runs
      // `clear()` + `bulkPut(empty)` could clobber recoverable data. Suppress the
      // debounced save; the explicit "Retry now" path below stays live so the
      // user can still push their in-memory edits once the DB becomes writable.
      //
      // Also suppress while an unresolved cross-tab conflict is showing (issue
      // #67, ADR-0024): auto-save stays paused so nothing this tab does can
      // clobber the other tab's data until the user reloads or exports.
      if (loadFailed || sync.conflict.value !== null) {
        return
      }
      pendingPayload = lifecycle.snapshotAppData()
      if (saveTimer) {
        clearTimeout(saveTimer)
      }
      saveTimer = setTimeout(flushPendingSave, 800)
    },
    { deep: true },
  )

  // "Retry now" (recovery action): re-save the latest snapshot immediately,
  // resetting the attempt counter (issue #65, Q3.3).
  watch(
    () => storageHealth.retryToken.value,
    () => {
      pendingPayload = lifecycle.snapshotAppData()
      flushPendingSave()
    },
  )

  window.addEventListener('pagehide', finalFlush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      finalFlush()
    }
  })

  // Central day clock (issue #70, ADR-0018). Registered *after* the snapshot
  // watch above so a rollover detected during startup — or later, while the PWA
  // is left open past local midnight — reconciles missed entries/coaching and
  // the resulting mutations reach the debounced save. `start()` runs `syncNow()`
  // before arming its timer, catching any rollover that elapsed during
  // `persistence.load()`.
  const clock = useClock()
  clock.onRollover((key) => {
    storageHealth.recordReconcile(lifecycle.reconcileDerivedState(key))
  })
  clock.start()

  // Start cross-tab sync after the snapshot watch and the clock, so its
  // freshness probes and remote applies compose with the debounced save and the
  // rollover reconcile (issue #67, ADR-0024).
  sync.start()

  const reminderEngine = useReminderEngine()
  reminderEngine.start()
})

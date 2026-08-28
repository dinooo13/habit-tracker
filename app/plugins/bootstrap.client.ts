import { watch } from 'vue'
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
  const { data: loaded, failed: loadFailed } = await loadAppDataSafely(
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

  // The retry/backoff loop lives in a framework-free saver (ADR-0017); the 800ms
  // edit debounce and the actual `persistence.save` binding stay here (ADR-0015).
  const saver = createPersistenceSaver({
    save: payload => persistence.save(payload),
    markSaving: () => storageHealth.markSaving(),
    markSaved: () => storageHealth.markSaved(),
    reportWriteFailure: error => storageHealth.reportWriteFailure(error),
    markUnavailable: reason => storageHealth.markUnavailable(reason),
    // Re-check quota after a successful large write (SEC-18).
    onSaved: () => {
      void storageHealth.checkQuota()
    },
  })

  let pendingPayload: AppData | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

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
  // await a backoff loop — one plain save, no retries (issue #65, Q2.5).
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
    storageHealth.markSaving()
    persistence
      .save(payload)
      .then(() => storageHealth.markSaved())
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
      if (loadFailed) {
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

  const reminderEngine = useReminderEngine()
  reminderEngine.start()
})

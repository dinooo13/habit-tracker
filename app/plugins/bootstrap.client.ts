import { watch } from 'vue'
import type { AppData } from '~/types/app-data'
import { todayDateKey } from '~/utils/domain/date'
import { applyPrimaryColorPalette } from '~/utils/ui/primary-color'

function requestPersistentStorage(): void {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return
  }

  navigator.storage
    .persisted()
    .then(persisted => (persisted ? true : navigator.storage.persist()))
    .catch(() => false)
}

export default defineNuxtPlugin(async () => {
  requestPersistentStorage()

  const persistence = usePersistence()
  const storageHealth = useStorageHealth()

  // Best-effort quota pre-check at startup (SEC-18). Non-fatal when unavailable.
  void storageHealth.checkQuota()

  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()
  const settingsStore = useSettingsStore()
  const lifecycle = useAppDataLifecycle()

  const loaded = await persistence.load()
  lifecycle.replaceAppData(loaded)
  lifecycle.reconcileDerivedState(todayDateKey())

  watch(
    () => settingsStore.primaryColor,
    (value) => {
      applyPrimaryColorPalette(value)
    },
  )

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
    persistence
      .save(payload)
      .then(() => {
        // Re-check quota after a successful large write (SEC-18).
        void storageHealth.checkQuota()
      })
      .catch((error) => {
        // Surface write failures (esp. QuotaExceededError) to the user via the
        // storage-health composable; the layout watches it to raise a toast.
        // reportWriteFailure logs to the security-event console sink, so no
        // separate console.error is needed here.
        storageHealth.reportWriteFailure(error)
      })
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
      pendingPayload = lifecycle.snapshotAppData()
      if (saveTimer) {
        clearTimeout(saveTimer)
      }
      saveTimer = setTimeout(flushPendingSave, 800)
    },
    { deep: true },
  )

  window.addEventListener('pagehide', flushPendingSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSave()
    }
  })

  const reminderEngine = useReminderEngine()
  reminderEngine.start()
})

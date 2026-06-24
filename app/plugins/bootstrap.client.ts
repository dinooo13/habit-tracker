import { watch } from 'vue'
import type { AppData } from '~/types/app-data'
import { todayDateKey } from '~/utils/date'
import { applyPrimaryColorPalette } from '~/utils/primary-color'

function requestPersistentStorage(): void {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return
  }

  navigator.storage
    .persisted()
    .then((persisted) => (persisted ? true : navigator.storage.persist()))
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

  const loaded = await persistence.load()
  habitsStore.hydrate(loaded.habits)
  entriesStore.hydrate(loaded.entries)
  coachStore.hydrate(loaded.suggestions)
  settingsStore.hydrate(loaded.settings)
  applyPrimaryColorPalette(settingsStore.primaryColor)

  entriesStore.ensureMissedEntries(habitsStore.activeHabits, todayDateKey())
  coachStore.reconcileMissingSuggestions(habitsStore.activeHabits, entriesStore.entries)

  watch(
    () => settingsStore.primaryColor,
    (value) => {
      applyPrimaryColorPalette(value)
    }
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
        console.error('Failed to persist app data', error)
        storageHealth.reportWriteFailure(error)
      })
  }

  watch(
    () => ({
      schemaVersion: loaded.schemaVersion,
      habits: habitsStore.snapshot(),
      entries: entriesStore.snapshot(),
      suggestions: coachStore.snapshot(),
      settings: settingsStore.snapshot()
    }),
    (nextValue) => {
      pendingPayload = nextValue
      if (saveTimer) {
        clearTimeout(saveTimer)
      }
      saveTimer = setTimeout(flushPendingSave, 800)
    },
    { deep: true }
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

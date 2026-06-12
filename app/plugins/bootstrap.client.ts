import { watch } from 'vue'
import type { AppDataV1 } from '~/types/app-data'
import { todayDateKey } from '~/utils/date'
import { applyPrimaryColorPalette } from '~/utils/primary-color'

export default defineNuxtPlugin(async () => {
  const persistence = usePersistence()

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

  let pendingPayload: AppDataV1 | null = null
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
    persistence.save(payload).catch((error) => {
      console.error('Failed to persist app data', error)
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

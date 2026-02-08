import { watch } from 'vue'
import { todayDateKey } from '~/utils/date'
import { applyPrimaryColorPalette } from '~/utils/primary-color'

export default defineNuxtPlugin(() => {
  const persistence = usePersistence()

  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()
  const settingsStore = useSettingsStore()

  const loaded = persistence.load()
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

  watch(
    () => ({
      schemaVersion: loaded.schemaVersion,
      habits: habitsStore.snapshot(),
      entries: entriesStore.snapshot(),
      suggestions: coachStore.snapshot(),
      settings: settingsStore.snapshot()
    }),
    (nextValue) => {
      persistence.save(nextValue)
    },
    { deep: true, immediate: true }
  )

  const reminderEngine = useReminderEngine()
  reminderEngine.start()
})

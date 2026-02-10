import type { AppDataV1 } from '~/types/app-data'
import { todayDateKey } from '~/utils/date'
import { applyPrimaryColorPalette } from '~/utils/primary-color'
import { parseAppData } from '~/utils/storage-schema'

const DEMO_FIXTURE_URL = '/fixtures/habit-tracker-demo.json'

export async function fetchDemoPayload(fetchImpl: typeof fetch, fixtureUrl = DEMO_FIXTURE_URL): Promise<AppDataV1> {
  const response = await fetchImpl(fixtureUrl, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Demo fixture request failed with ${response.status}`)
  }

  return parseAppData(await response.json())
}

interface DemoHydrateDependencies {
  habitsStore: ReturnType<typeof useHabitsStore>
  entriesStore: ReturnType<typeof useEntriesStore>
  coachStore: ReturnType<typeof useCoachStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  persistence: ReturnType<typeof usePersistence>
}

export function hydrateDemoPayload(payload: AppDataV1, dependencies: DemoHydrateDependencies): void {
  const { habitsStore, entriesStore, coachStore, settingsStore, persistence } = dependencies

  habitsStore.hydrate(payload.habits)
  entriesStore.hydrate(payload.entries)
  coachStore.hydrate(payload.suggestions)
  settingsStore.hydrate(payload.settings)

  entriesStore.ensureMissedEntries(habitsStore.activeHabits, todayDateKey())
  coachStore.reconcileMissingSuggestions(habitsStore.activeHabits, entriesStore.entries)
  applyPrimaryColorPalette(settingsStore.primaryColor)

  persistence.save({
    ...payload,
    entries: entriesStore.snapshot(),
    suggestions: coachStore.snapshot(),
    settings: settingsStore.snapshot()
  })
}

export function useDemoData() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()
  const settingsStore = useSettingsStore()
  const persistence = usePersistence()

  const isLoading = ref(false)
  const hasExistingData = computed(
    () => habitsStore.habits.length > 0 || entriesStore.entries.length > 0 || coachStore.suggestions.length > 0
  )

  async function loadDemoData(options: { replaceExisting?: boolean } = {}): Promise<{ loaded: boolean; reason?: 'existing-data' }> {
    const { replaceExisting = false } = options

    if (!replaceExisting && hasExistingData.value) {
      return { loaded: false, reason: 'existing-data' }
    }

    isLoading.value = true

    try {
      const payload = await fetchDemoPayload(fetch)
      hydrateDemoPayload(payload, {
        habitsStore,
        entriesStore,
        coachStore,
        settingsStore,
        persistence
      })

      return { loaded: true }
    } finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    hasExistingData,
    loadDemoData
  }
}

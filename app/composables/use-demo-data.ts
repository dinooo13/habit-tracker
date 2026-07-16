import type { AppData } from '~/types/app-data'
import { generateDemoData } from '~/utils/domain/demo-data-generator'
import { parseAppData } from '~/utils/persistence/storage-schema'

const DEMO_FIXTURE_URL = '/fixtures/habit-tracker-demo.json'

export async function fetchDemoPayload(fetchImpl: typeof fetch, fixtureUrl = DEMO_FIXTURE_URL): Promise<AppData> {
  const response = await fetchImpl(fixtureUrl, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Demo fixture request failed with ${response.status}`)
  }

  return parseAppData(await response.json())
}

/**
 * Loads a demo/fixture payload as a whole-envelope replacement: hydrate all
 * stores + apply palette (`replaceAppData`), reconcile derived state, then
 * persist the normalized snapshot. All lifecycle sequencing lives in the shared
 * composable (ADR-0015).
 */
export async function hydrateDemoPayload(payload: AppData): Promise<void> {
  const lifecycle = useAppDataLifecycle()
  const persistence = usePersistence()

  lifecycle.replaceAppData(payload)
  lifecycle.reconcileDerivedState()

  await persistence.save(lifecycle.snapshotAppData())
}

export function useDemoData() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()

  const isLoading = ref(false)
  const hasExistingData = computed(
    () => habitsStore.habits.length > 0 || entriesStore.entries.length > 0 || coachStore.suggestions.length > 0,
  )

  async function loadDemoData(options: { replaceExisting?: boolean } = {}): Promise<{ loaded: boolean, reason?: 'existing-data' }> {
    const { replaceExisting = false } = options

    if (!replaceExisting && hasExistingData.value) {
      return { loaded: false, reason: 'existing-data' }
    }

    isLoading.value = true

    try {
      const payload = generateDemoData()
      await hydrateDemoPayload(payload)

      return { loaded: true }
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    hasExistingData,
    loadDemoData,
  }
}

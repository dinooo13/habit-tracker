import type { AppData } from '~/types/app-data'
import { APP_DATA_SCHEMA_VERSION } from '~/types/app-data'
import { nowIso, todayDateKey } from '~/utils/domain/date'
import type { ReconcileSummary } from '~/utils/observability/storage-health'
import { applyPrimaryColorPalette } from '~/utils/ui/primary-color'

/**
 * Single source of truth for the four-store data lifecycle (ADR-0015).
 *
 * Collapses the snapshot/hydrate/reconcile sequences that were previously
 * hand-rolled in `bootstrap.client.ts`, `settings.vue`, and `use-demo-data.ts`
 * into three functions so the persist envelope, the `schemaVersion` source, and
 * the hydrate/reconcile order are each defined in exactly one place.
 *
 * This is intentionally a **composable, not a `utils/` helper** (ADR-0014): it
 * reads/writes the four Pinia stores and applies the UI palette, which is
 * orchestration rather than a pure function. It is deliberately *state-only* —
 * UI side effects (toasts, security logging, backup-nudge, quota checks) and
 * the actual `persistence.save()` stay at the call sites.
 */
export function useAppDataLifecycle() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()
  const settingsStore = useSettingsStore()

  /**
   * Builds the plain, proxy-free persist/export envelope from the four stores'
   * `snapshot()` results, stamping the current `APP_DATA_SCHEMA_VERSION`. The
   * single definition of the persist payload.
   */
  function snapshotAppData(): AppData {
    return {
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      habits: habitsStore.snapshot(),
      entries: entriesStore.snapshot(),
      suggestions: coachStore.snapshot(),
      settings: settingsStore.snapshot(),
    }
  }

  /**
   * Whole-envelope replacement: hydrates all four stores from a parsed
   * `AppData` and applies the primary-color palette. Not for partial merges —
   * this clobbers every store.
   */
  function replaceAppData(data: AppData): void {
    habitsStore.hydrate(data.habits)
    entriesStore.hydrate(data.entries)
    coachStore.hydrate(data.suggestions)
    settingsStore.hydrate(data.settings)
    applyPrimaryColorPalette(settingsStore.primaryColor)
  }

  /**
   * Recomputes runtime-only derived state for `dateKey` (defaults to today):
   * backfills missed entries for due-but-unlogged past days, then reconciles
   * coaching suggestions against the resulting misses. Order matters —
   * suggestions are derived from the reconciled entries.
   *
   * Returns the counts each store call already produces (issue #73) so the
   * bootstrap can surface boot/rollover reconcile activity in the persistence
   * health panel. Purely additive — callers that ignore the return (import,
   * delete-all) are unaffected.
   */
  function reconcileDerivedState(dateKey: string = todayDateKey()): ReconcileSummary {
    const missedEntriesCreated = entriesStore.ensureMissedEntries(habitsStore.activeHabits, dateKey)
    const suggestionsCreated = coachStore.reconcileMissingSuggestions(habitsStore.activeHabits, entriesStore.entries)
    return { missedEntriesCreated, suggestionsCreated, at: nowIso() }
  }

  return {
    snapshotAppData,
    replaceAppData,
    reconcileDerivedState,
  }
}

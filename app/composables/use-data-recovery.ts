import type { Ref } from 'vue'
import { todayDateKey } from '~/utils/domain/date'
import { downloadRecoveredBackup } from '~/utils/persistence/export-backup'

const DATA_RECOVERY_QUARANTINE_KEY = 'data-recovery:quarantine'

/** Banner-facing metadata for a quarantined payload (not the full payload). */
export interface QuarantineMeta {
  capturedAt: string
  reason: string
}

export interface DataRecovery {
  /** Metadata for the load-time recovery banner, or `null` when nothing is quarantined. */
  quarantine: Ref<QuarantineMeta | null>
  /** Read the latest quarantine metadata from persistence and update {@link quarantine}. */
  refresh: () => Promise<void>
  /** Download the full quarantined payload as JSON so the user can recover it. */
  exportPreserved: () => Promise<boolean>
  /** Discard the quarantined payload and clear the banner. */
  discard: () => Promise<void>
}

/**
 * Load-time data-recovery state (issue #66, ADR-0019). When stored data fails
 * validation on boot, the persistence adapter preserves the raw payload in a
 * quarantine table; this composable exposes reactive metadata for the recovery
 * banner plus the export/discard actions.
 *
 * Kept deliberately **separate** from `useStorageHealth` so ADR-0017's
 * save-lifecycle contract stays at exactly four states (`ok | saving | failed |
 * unavailable`) — quarantine is a load-time concern that merely shares the same
 * UI surface. All adapter access is client-guarded inside `usePersistence`, so
 * these methods are safe to call anywhere and never throw when quarantine is
 * absent.
 */
export function useDataRecovery(): DataRecovery {
  const quarantine = useState<QuarantineMeta | null>(DATA_RECOVERY_QUARANTINE_KEY, () => null)
  const persistence = usePersistence()

  async function refresh(): Promise<void> {
    // Never throw: a missing/blocked IndexedDB (private mode, locked-down browser,
    // or a test env without the API) simply means "no quarantine to recover".
    try {
      const record = await persistence.loadQuarantine()
      quarantine.value = record ? { capturedAt: record.capturedAt, reason: record.reason } : null
    }
    catch {
      quarantine.value = null
    }
  }

  async function exportPreserved(): Promise<boolean> {
    try {
      const record = await persistence.loadQuarantine()
      if (!record) {
        return false
      }
      downloadRecoveredBackup(record.payload, todayDateKey())
      return true
    }
    catch {
      return false
    }
  }

  async function discard(): Promise<void> {
    try {
      await persistence.clearQuarantine()
    }
    catch {
      // Best-effort: clear the banner regardless so the user isn't stuck with it.
    }
    quarantine.value = null
  }

  return {
    quarantine,
    refresh,
    exportPreserved,
    discard,
  }
}

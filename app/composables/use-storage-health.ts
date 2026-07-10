import type { Ref } from 'vue'
import { describeWriteFailure, isQuotaExceededError, isQuotaLowFromEstimate } from '~/utils/observability/storage-health'

const STORAGE_HEALTH_LAST_ERROR_KEY = 'storage-health:last-error'
const STORAGE_HEALTH_QUOTA_LOW_KEY = 'storage-health:is-quota-low'
const STORAGE_HEALTH_WARNED_QUOTA_KEY = 'storage-health:warned-quota'

export interface StorageHealth {
  lastError: Ref<string | null>
  isQuotaLow: Ref<boolean>
  /** Best-effort quota pre-check; returns true when usage is high. Never throws. */
  checkQuota: () => Promise<boolean>
  /** Record a persistence write failure (esp. QuotaExceededError). */
  reportWriteFailure: (error: unknown) => void
}

/**
 * SEC-18: reactive storage-health state surfaced to the user via toasts. Tracks
 * the last write failure and whether the storage quota is running low. All
 * browser-only APIs (`navigator.storage.estimate`) are guarded and degrade to
 * no-ops when unavailable, so this is safe to call anywhere and never throws.
 * The decision logic lives in `~/utils/observability/storage-health` so it can be unit-tested.
 */
export function useStorageHealth(): StorageHealth {
  const lastError = useState<string | null>(STORAGE_HEALTH_LAST_ERROR_KEY, () => null)
  const isQuotaLow = useState<boolean>(STORAGE_HEALTH_QUOTA_LOW_KEY, () => false)
  const warnedQuota = useState<boolean>(STORAGE_HEALTH_WARNED_QUOTA_KEY, () => false)
  const { logSecurityEvent } = useSecurityLog()

  async function checkQuota(): Promise<boolean> {
    if (!import.meta.client || typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return false
    }

    try {
      const estimate = await navigator.storage.estimate()
      const low = isQuotaLowFromEstimate(estimate)
      isQuotaLow.value = low

      if (low && !warnedQuota.value) {
        warnedQuota.value = true
        const ratio = (estimate.usage ?? 0) / (estimate.quota ?? 1)
        logSecurityEvent('storage.quota_low', 'warn', `Storage usage at ${Math.round(ratio * 100)}% of quota`)
      }
      else if (!low) {
        // Reset the one-shot guard once we drop back below the threshold.
        warnedQuota.value = false
      }

      return low
    }
    catch {
      // estimate() may reject or be blocked; treat as non-fatal.
      return false
    }
  }

  function reportWriteFailure(error: unknown): void {
    lastError.value = describeWriteFailure(error)
    logSecurityEvent('storage.write_failed', 'error', error instanceof Error ? error.message : String(error))

    if (isQuotaExceededError(error)) {
      isQuotaLow.value = true
    }
  }

  return { lastError, isQuotaLow, checkQuota, reportWriteFailure }
}

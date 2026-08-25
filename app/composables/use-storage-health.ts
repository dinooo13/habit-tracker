import type { Ref } from 'vue'
import { nowIso } from '~/utils/domain/date'
import type { PersistenceStatus } from '~/utils/observability/storage-health'
import { describeWriteFailure, isQuotaExceededError, isQuotaLowFromEstimate } from '~/utils/observability/storage-health'

const STORAGE_HEALTH_LAST_ERROR_KEY = 'storage-health:last-error'
const STORAGE_HEALTH_QUOTA_LOW_KEY = 'storage-health:is-quota-low'
const STORAGE_HEALTH_WARNED_QUOTA_KEY = 'storage-health:warned-quota'
const STORAGE_HEALTH_STATUS_KEY = 'storage-health:status'
const STORAGE_HEALTH_LAST_SAVED_KEY = 'storage-health:last-saved-at'
const STORAGE_HEALTH_RETRY_TOKEN_KEY = 'storage-health:retry-token'
const STORAGE_HEALTH_DEGRADED_KEY = 'storage-health:degraded-since-ok'

export interface StorageHealth {
  lastError: Ref<string | null>
  isQuotaLow: Ref<boolean>
  /** Persistence lifecycle state (issue #65, ADR-0017). */
  status: Ref<PersistenceStatus>
  /** ISO timestamp of the last successful save; `null` until the first write. In-memory only. */
  lastSavedAt: Ref<string | null>
  /** Bumped by {@link requestRetry}; the bootstrap save path watches it to re-save on demand. */
  retryToken: Ref<number>
  /** Best-effort quota pre-check; returns true when usage is high. Never throws. */
  checkQuota: () => Promise<boolean>
  /** Record a persistence write failure (esp. QuotaExceededError). Transitions to `failed`. */
  reportWriteFailure: (error: unknown) => void
  /** A save is in flight → `saving`. */
  markSaving: () => void
  /** A save succeeded → `ok`, stamp `lastSavedAt`, clear the last error, log recovery if degraded. */
  markSaved: () => void
  /** Enter terminal degraded mode → `unavailable`; logs `storage.unavailable` once per episode. */
  markUnavailable: (reason?: string) => void
  /** Request an on-demand save (the "Retry now" recovery action). */
  requestRetry: () => void
}

/**
 * SEC-18 + issue #65: reactive storage-health state surfaced to the user via
 * toasts and the app-shell persistence indicator. Tracks the last write failure,
 * whether the storage quota is running low, and the persistence lifecycle
 * (`ok | saving | failed | unavailable`) plus the last successful-save time.
 *
 * All browser-only APIs (`navigator.storage.estimate`) are guarded and degrade to
 * no-ops when unavailable, so this is safe to call anywhere and never throws. The
 * decision logic and the retry/backoff schedule live in
 * `~/utils/observability/storage-health` so they can be unit-tested; the
 * retry/backoff *orchestration* lives in the bootstrap save path (ADR-0015).
 */
export function useStorageHealth(): StorageHealth {
  const lastError = useState<string | null>(STORAGE_HEALTH_LAST_ERROR_KEY, () => null)
  const isQuotaLow = useState<boolean>(STORAGE_HEALTH_QUOTA_LOW_KEY, () => false)
  const warnedQuota = useState<boolean>(STORAGE_HEALTH_WARNED_QUOTA_KEY, () => false)
  const status = useState<PersistenceStatus>(STORAGE_HEALTH_STATUS_KEY, () => 'ok')
  const lastSavedAt = useState<string | null>(STORAGE_HEALTH_LAST_SAVED_KEY, () => null)
  const retryToken = useState<number>(STORAGE_HEALTH_RETRY_TOKEN_KEY, () => 0)
  // Sticky "have we been degraded since the last successful save?" flag. Tracked
  // independently of `status` because the save path flips `status` to the
  // transient `saving` before every attempt (including the recovering one), so
  // `status` alone can't tell `markSaved` whether it is exiting a degraded episode.
  const degradedSinceOk = useState<boolean>(STORAGE_HEALTH_DEGRADED_KEY, () => false)
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
    // Transient: a retry is (usually) scheduled by the save path. Escalation to
    // `unavailable` is a separate, explicit call once retries are exhausted or a
    // quota error short-circuits.
    status.value = 'failed'
    degradedSinceOk.value = true
    logSecurityEvent('storage.write_failed', 'error', error instanceof Error ? error.message : String(error))

    if (isQuotaExceededError(error)) {
      isQuotaLow.value = true
    }
  }

  function markSaving(): void {
    status.value = 'saving'
  }

  function markSaved(): void {
    // Read the sticky degraded flag, not `status`: the save path sets `status` to
    // `saving` before the recovering attempt, so it is never `failed`/`unavailable`
    // here in the wired flow (issue #65 QA fix).
    const wasDegraded = degradedSinceOk.value
    status.value = 'ok'
    degradedSinceOk.value = false
    lastSavedAt.value = nowIso()
    lastError.value = null

    if (wasDegraded) {
      logSecurityEvent('storage.recovered', 'info', 'Persistence recovered after a failed save')
    }
  }

  function markUnavailable(reason?: string): void {
    // Log at most once per degraded episode so a stuck save can't spam the log.
    if (status.value !== 'unavailable') {
      logSecurityEvent('storage.unavailable', 'error', reason ? `Persistence unavailable: ${reason}` : 'Persistence unavailable')
    }
    status.value = 'unavailable'
    degradedSinceOk.value = true
  }

  function requestRetry(): void {
    retryToken.value += 1
  }

  return {
    lastError,
    isQuotaLow,
    status,
    lastSavedAt,
    retryToken,
    checkQuota,
    reportWriteFailure,
    markSaving,
    markSaved,
    markUnavailable,
    requestRetry,
  }
}

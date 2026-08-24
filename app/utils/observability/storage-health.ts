// SEC-18: pure helpers behind the reactive `useStorageHealth()` composable, kept
// framework-free so they can be unit-tested directly (project convention favours
// testing pure functions over rendering — see docs/TESTING.md).

// Warn once usage crosses this fraction of the granted quota.
export const STORAGE_QUOTA_WARN_RATIO = 0.9

/**
 * The persistence lifecycle surfaced to the user (issue #65, ADR-0017):
 * - `ok` — the last write succeeded (or nothing has been written yet).
 * - `saving` — a write is in flight.
 * - `failed` — a write failed and a retry is scheduled (transient, self-clearing).
 * - `unavailable` — writes are terminally failing (retries exhausted, quota full,
 *   or the database could not be opened). The recovery banner is shown here.
 */
export type PersistenceStatus = 'ok' | 'saving' | 'failed' | 'unavailable'

// Retry/backoff schedule for a failed save (issue #65). Exponential base 1s ×2,
// capped at 8s, at most 3 retries, with ±20% jitter so concurrent tabs don't
// retry in lockstep. Quota-exceeded errors skip retries entirely (retrying a
// full disk just fails again) — that short-circuit lives at the call site.
export const RETRY_BASE_MS = 1000
export const RETRY_CAP_MS = 8000
export const MAX_SAVE_RETRIES = 3
export const RETRY_JITTER_RATIO = 0.2

/**
 * Delay (ms) before the given zero-based retry `attempt`. Exponential
 * (`RETRY_BASE_MS * 2^attempt`) capped at `RETRY_CAP_MS`, then perturbed by up to
 * ±`RETRY_JITTER_RATIO`. Never negative. Pure except for the jitter draw, which
 * can be made deterministic in tests by stubbing `Math.random`.
 */
export function nextRetryDelay(attempt: number): number {
  const base = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt), RETRY_CAP_MS)
  const jitter = base * RETRY_JITTER_RATIO * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(base + jitter))
}

/** True when the error represents an exhausted storage quota. */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.code === 22
  }

  if (error instanceof Error) {
    return error.name === 'QuotaExceededError' || /quota/i.test(error.message)
  }

  return false
}

/**
 * Decide whether a `navigator.storage.estimate()` result indicates low storage.
 * Returns `false` defensively when either figure is missing or zero.
 */
export function isQuotaLowFromEstimate(estimate: { usage?: number, quota?: number } | null | undefined): boolean {
  if (!estimate) {
    return false
  }

  const { usage, quota } = estimate
  if (!usage || !quota) {
    return false
  }

  return usage / quota >= STORAGE_QUOTA_WARN_RATIO
}

/** Human-readable message for a persistence write failure. */
export function describeWriteFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return isQuotaExceededError(error) ? `Storage is full: ${message}` : message
}

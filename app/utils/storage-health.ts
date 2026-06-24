// SEC-18: pure helpers behind the reactive `useStorageHealth()` composable, kept
// framework-free so they can be unit-tested directly (project convention favours
// testing pure functions over rendering — see docs/TESTING.md).

// Warn once usage crosses this fraction of the granted quota.
export const STORAGE_QUOTA_WARN_RATIO = 0.9

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
export function isQuotaLowFromEstimate(estimate: { usage?: number; quota?: number } | null | undefined): boolean {
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

export const DUMMY_AUTH_STORAGE_KEY = 'habit-tracker:v1:dummy-auth'
// SEC-03: absolute expiry timestamp stored alongside the flag. Kept in its own
// localStorage key, outside the persisted AppDataV1 envelope (no schema change).
export const DUMMY_AUTH_EXPIRY_STORAGE_KEY = 'habit-tracker:v1:dummy-auth-expires-at'

// Absolute session lifetime. The session is treated as logged-out once this
// elapses since login — there is no idle timer and no sliding renewal.
export const DUMMY_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type ReadableStorage = Pick<Storage, 'getItem' | 'removeItem'>
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>

/**
 * Read the dummy-auth login state, honouring the absolute expiry stamp (SEC-03).
 *
 * Returns `false` — and clears the stale keys — when the flag is absent, the
 * expiry stamp is missing/unparseable, or the expiry time has passed. The
 * storage is mutated only to clear stale state, keeping the read defensive.
 */
export function readDummyAuth(storage: ReadableStorage | null | undefined): boolean {
  if (!storage) {
    return false
  }

  if (storage.getItem(DUMMY_AUTH_STORAGE_KEY) !== '1') {
    return false
  }

  const rawExpiry = storage.getItem(DUMMY_AUTH_EXPIRY_STORAGE_KEY)
  const expiresAt = rawExpiry === null ? Number.NaN : Number(rawExpiry)

  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    // Expired or malformed: drop both keys so the session can't be revived.
    storage.removeItem(DUMMY_AUTH_STORAGE_KEY)
    storage.removeItem(DUMMY_AUTH_EXPIRY_STORAGE_KEY)
    return false
  }

  return true
}

/**
 * Persist the dummy-auth login state. On login, also writes an absolute expiry
 * stamp at `now + ttlMs` (SEC-03). On logout, clears both keys.
 */
export function writeDummyAuth(
  storage: WritableStorage | null | undefined,
  isLoggedIn: boolean,
  ttlMs: number = DUMMY_AUTH_TTL_MS,
): void {
  if (!storage) {
    return
  }

  if (isLoggedIn) {
    storage.setItem(DUMMY_AUTH_STORAGE_KEY, '1')
    storage.setItem(DUMMY_AUTH_EXPIRY_STORAGE_KEY, String(Date.now() + ttlMs))
    return
  }

  storage.removeItem(DUMMY_AUTH_STORAGE_KEY)
  storage.removeItem(DUMMY_AUTH_EXPIRY_STORAGE_KEY)
}

export function isSafeInternalRedirect(path: unknown): path is string {
  if (typeof path !== 'string') {
    return false
  }

  if (!path.startsWith('/') || path.startsWith('//')) {
    return false
  }

  return !/[\r\n]/.test(path)
}

export function resolveRedirectTarget(rawPath: unknown, fallback = '/app'): string {
  if (Array.isArray(rawPath)) {
    return resolveRedirectTarget(rawPath[0], fallback)
  }

  return isSafeInternalRedirect(rawPath) ? rawPath : fallback
}

export const DUMMY_AUTH_STORAGE_KEY = 'habit-tracker:v1:dummy-auth'

export function readDummyAuth(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  if (!storage) {
    return false
  }

  return storage.getItem(DUMMY_AUTH_STORAGE_KEY) === '1'
}

export function writeDummyAuth(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, isLoggedIn: boolean): void {
  if (!storage) {
    return
  }

  if (isLoggedIn) {
    storage.setItem(DUMMY_AUTH_STORAGE_KEY, '1')
    return
  }

  storage.removeItem(DUMMY_AUTH_STORAGE_KEY)
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

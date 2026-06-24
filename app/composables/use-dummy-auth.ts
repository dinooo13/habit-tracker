import { DUMMY_AUTH_STORAGE_KEY, readDummyAuth, writeDummyAuth } from '~/utils/dummy-auth'

const DUMMY_AUTH_STATE_KEY = 'dummy-auth:is-logged-in'
const DUMMY_AUTH_INIT_KEY = 'dummy-auth:is-initialized'

export function useDummyAuth() {
  const isLoggedIn = useState<boolean>(DUMMY_AUTH_STATE_KEY, () => false)
  const isInitialized = useState<boolean>(DUMMY_AUTH_INIT_KEY, () => false)
  const { logSecurityEvent } = useSecurityLog()

  function initFromStorage(): void {
    if (isInitialized.value) {
      return
    }

    if (import.meta.client) {
      // Note whether a flag existed before the read: `readDummyAuth` clears the
      // stale keys when the absolute expiry has passed (SEC-03), so a flag that
      // was present but now reads as false indicates an expired session.
      const hadFlag = window.localStorage.getItem(DUMMY_AUTH_STORAGE_KEY) === '1'
      isLoggedIn.value = readDummyAuth(window.localStorage)

      if (hadFlag && !isLoggedIn.value) {
        logSecurityEvent('session.expired', 'info', 'Absolute session timeout reached')
      }
    }

    isInitialized.value = true
  }

  function login(): void {
    if (import.meta.client) {
      writeDummyAuth(window.localStorage, true)
    }

    isLoggedIn.value = true
    isInitialized.value = true
    logSecurityEvent('auth.login')
  }

  function logout(): void {
    if (import.meta.client) {
      writeDummyAuth(window.localStorage, false)
    }

    isLoggedIn.value = false
    isInitialized.value = true
    logSecurityEvent('auth.logout')
  }

  return {
    storageKey: DUMMY_AUTH_STORAGE_KEY,
    isLoggedIn,
    isInitialized,
    initFromStorage,
    login,
    logout
  }
}

import { DUMMY_AUTH_STORAGE_KEY, readDummyAuth, writeDummyAuth } from '~/utils/dummy-auth'

const DUMMY_AUTH_STATE_KEY = 'dummy-auth:is-logged-in'
const DUMMY_AUTH_INIT_KEY = 'dummy-auth:is-initialized'

export function useDummyAuth() {
  const isLoggedIn = useState<boolean>(DUMMY_AUTH_STATE_KEY, () => false)
  const isInitialized = useState<boolean>(DUMMY_AUTH_INIT_KEY, () => false)

  function initFromStorage(): void {
    if (isInitialized.value) {
      return
    }

    if (import.meta.client) {
      isLoggedIn.value = readDummyAuth(window.localStorage)
    }

    isInitialized.value = true
  }

  function login(): void {
    if (import.meta.client) {
      writeDummyAuth(window.localStorage, true)
    }

    isLoggedIn.value = true
    isInitialized.value = true
  }

  function logout(): void {
    if (import.meta.client) {
      writeDummyAuth(window.localStorage, false)
    }

    isLoggedIn.value = false
    isInitialized.value = true
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

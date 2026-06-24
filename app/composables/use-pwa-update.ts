import { computed, ref, type ComputedRef } from 'vue'

/**
 * SEC-14: thin wrapper around `@vite-pwa/nuxt`'s reactive `$pwa` injection so a
 * non-blocking "new version available" banner can prompt the user before a
 * downloaded service-worker update is applied.
 *
 * With `registerType: 'prompt'` the new worker is fetched but stays in the
 * `waiting` state; `$pwa.needRefresh` flips to `true` and `updateServiceWorker`
 * activates it (reloading the page). When `$pwa` is unavailable — during SSR,
 * in unit tests, or when the module is disabled — this degrades to a no-op so
 * the build and tests stay green.
 */
export interface PwaUpdateController {
  needRefresh: ComputedRef<boolean>
  reload: () => Promise<void>
  dismiss: () => void
}

export function usePwaUpdate(): PwaUpdateController {
  const fallbackNeedRefresh = ref(false)

  if (!import.meta.client) {
    return {
      needRefresh: computed(() => false),
      reload: async () => {},
      dismiss: () => {}
    }
  }

  const pwa = useNuxtApp().$pwa

  if (!pwa) {
    // Virtual module / service worker not registered (dev without PWA, tests).
    return {
      needRefresh: computed(() => fallbackNeedRefresh.value),
      reload: async () => {},
      dismiss: () => {
        fallbackNeedRefresh.value = false
      }
    }
  }

  const { logSecurityEvent } = useSecurityLog()
  let announced = false

  const needRefresh = computed(() => {
    const value = Boolean(pwa.needRefresh)
    if (value && !announced) {
      announced = true
      logSecurityEvent('pwa.update.available', 'info', 'Service worker update awaiting confirmation')
    }
    return value
  })

  async function reload(): Promise<void> {
    logSecurityEvent('pwa.update.applied', 'info', 'User applied service worker update')
    await pwa!.updateServiceWorker(true)
  }

  function dismiss(): void {
    void pwa!.cancelPrompt()
  }

  return { needRefresh, reload, dismiss }
}

import { isProtectedAppPath, mapLegacyPath } from '~/utils/route-mapping'
import { resolveRedirectTarget } from '~/utils/dummy-auth'

export default defineNuxtRouteMiddleware((to) => {
  const legacyTarget = mapLegacyPath(to.path)
  if (legacyTarget) {
    return navigateTo({ path: legacyTarget, query: to.query, hash: to.hash }, { replace: true, redirectCode: 301 })
  }

  const dummyAuth = useDummyAuth()
  dummyAuth.initFromStorage()

  if (to.path === '/login') {
    if (dummyAuth.isLoggedIn.value) {
      return navigateTo(resolveRedirectTarget(to.query.redirect, '/app'), { replace: true })
    }

    return
  }

  if (!isProtectedAppPath(to.path)) {
    return
  }

  if (dummyAuth.isLoggedIn.value) {
    return
  }

  return navigateTo({ path: '/login', query: { redirect: to.fullPath } }, { replace: true })
})

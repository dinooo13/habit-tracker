import { isProtectedAppPath, mapLegacyPath } from '~/utils/route-mapping'

export default defineNuxtRouteMiddleware((to) => {
  const legacyTarget = mapLegacyPath(to.path)
  if (legacyTarget) {
    return navigateTo({ path: legacyTarget, query: to.query, hash: to.hash }, { replace: true, redirectCode: 301 })
  }

  if (!isProtectedAppPath(to.path)) {
    return
  }

  const dummyAuth = useDummyAuth()
  dummyAuth.initFromStorage()

  if (dummyAuth.isLoggedIn.value) {
    return
  }

  return navigateTo({ path: '/', query: { redirect: to.fullPath } }, { replace: true })
})

const STATIC_LEGACY_REDIRECTS: Record<string, string> = {
  '/habits': '/app/habits',
  '/habits/new': '/app/habits/new',
  '/review': '/app/review',
  '/insights': '/app/insights',
  '/settings': '/app/settings'
}

export function mapLegacyPath(path: string): string | null {
  if (STATIC_LEGACY_REDIRECTS[path]) {
    return STATIC_LEGACY_REDIRECTS[path]
  }

  if (path.startsWith('/habits/')) {
    return `/app${path}`
  }

  return null
}

export function isProtectedAppPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app/')
}

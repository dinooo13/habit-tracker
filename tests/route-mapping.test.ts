import { describe, expect, it } from 'vitest'
import { isProtectedAppPath, mapLegacyPath } from '~/utils/route-mapping'

describe('legacy route mapping', () => {
  it('maps static legacy routes to /app/*', () => {
    expect(mapLegacyPath('/habits')).toBe('/app/habits')
    expect(mapLegacyPath('/habits/new')).toBe('/app/habits/new')
    expect(mapLegacyPath('/review')).toBe('/app/review')
    expect(mapLegacyPath('/insights')).toBe('/app/insights')
    expect(mapLegacyPath('/settings')).toBe('/app/settings')
  })

  it('maps dynamic habit routes', () => {
    expect(mapLegacyPath('/habits/habit_123')).toBe('/app/habits/habit_123')
  })

  it('does not map non-legacy routes', () => {
    expect(mapLegacyPath('/')).toBeNull()
    expect(mapLegacyPath('/app')).toBeNull()
    expect(mapLegacyPath('/app/habits')).toBeNull()
  })

  it('identifies protected app paths', () => {
    expect(isProtectedAppPath('/app')).toBe(true)
    expect(isProtectedAppPath('/app/review')).toBe(true)
    expect(isProtectedAppPath('/')).toBe(false)
    expect(isProtectedAppPath('/review')).toBe(false)
  })
})

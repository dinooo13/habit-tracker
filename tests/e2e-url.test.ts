import { describe, expect, it } from 'vitest'
import { appRoutePattern } from '../e2e/support/url'

describe('appRoutePattern', () => {
  it('accepts both the no-slash and trailing-slash URL shapes', () => {
    const pattern = appRoutePattern('/app')
    // Local nitro preview serves `/app` with no redirect; the production host
    // 301-redirects to `/app/`. Both must match (issue #106).
    expect(pattern.test('https://habits.fmeyer.dev/app')).toBe(true)
    expect(pattern.test('https://habits.fmeyer.dev/app/')).toBe(true)
  })

  it('is base-path tolerant (not anchored at the start)', () => {
    const pattern = appRoutePattern('/app')
    expect(pattern.test('https://preview.habits.fmeyer.dev/pr-12/app/')).toBe(true)
    expect(pattern.test('https://preview.habits.fmeyer.dev/pr-12/app')).toBe(true)
  })

  it('does not over-match a deeper route or a longer segment', () => {
    const pattern = appRoutePattern('/app')
    expect(pattern.test('https://habits.fmeyer.dev/app/insights')).toBe(false)
    expect(pattern.test('https://habits.fmeyer.dev/apps')).toBe(false)
  })

  it('handles nested and dynamic paths, still allowing an optional trailing slash', () => {
    const pattern = appRoutePattern('/app/habits/hab_123')
    expect(pattern.test('https://habits.fmeyer.dev/app/habits/hab_123')).toBe(true)
    expect(pattern.test('https://habits.fmeyer.dev/app/habits/hab_123/')).toBe(true)
    // A longer id must not match a prefix pattern.
    expect(pattern.test('https://habits.fmeyer.dev/app/habits/hab_1234')).toBe(false)
  })

  it('escapes regex metacharacters in the path so they match literally', () => {
    const pattern = appRoutePattern('/app/a.b')
    expect(pattern.test('https://h/app/a.b')).toBe(true)
    // The dot is escaped, so it does not match an arbitrary character.
    expect(pattern.test('https://h/app/axb')).toBe(false)
  })

  it('returns a RegExp', () => {
    expect(appRoutePattern('/app')).toBeInstanceOf(RegExp)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DUMMY_AUTH_STORAGE_KEY,
  isSafeInternalRedirect,
  readDummyAuth,
  resolveRedirectTarget,
  writeDummyAuth
} from '~/utils/dummy-auth'

function createStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }

  return {
    data,
    getItem(key: string): string | null {
      return key in data ? data[key] : null
    },
    setItem(key: string, value: string): void {
      data[key] = value
    },
    removeItem(key: string): void {
      delete data[key]
    }
  }
}

describe('dummy auth helpers', () => {
  it('reads login state from storage', () => {
    expect(readDummyAuth(createStorage())).toBe(false)
    expect(readDummyAuth(createStorage({ [DUMMY_AUTH_STORAGE_KEY]: '0' }))).toBe(false)
    expect(readDummyAuth(createStorage({ [DUMMY_AUTH_STORAGE_KEY]: '1' }))).toBe(true)
  })

  it('writes and clears login state in storage', () => {
    const storage = createStorage()

    writeDummyAuth(storage, true)
    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBe('1')

    writeDummyAuth(storage, false)
    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBeUndefined()
  })

  it('accepts only safe internal redirect paths', () => {
    expect(isSafeInternalRedirect('/app')).toBe(true)
    expect(isSafeInternalRedirect('/app/insights?range=30d')).toBe(true)
    expect(isSafeInternalRedirect('https://example.com')).toBe(false)
    expect(isSafeInternalRedirect('//example.com')).toBe(false)
    expect(isSafeInternalRedirect('app/insights')).toBe(false)
  })

  it('resolves redirect target with safe fallback', () => {
    expect(resolveRedirectTarget('/app/review')).toBe('/app/review')
    expect(resolveRedirectTarget(['//evil.test', '/app/settings'])).toBe('/app')
    expect(resolveRedirectTarget(undefined)).toBe('/app')
    expect(resolveRedirectTarget('https://evil.test', '/app/habits')).toBe('/app/habits')
  })
})

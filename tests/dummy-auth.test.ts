import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DUMMY_AUTH_EXPIRY_STORAGE_KEY,
  DUMMY_AUTH_STORAGE_KEY,
  DUMMY_AUTH_TTL_MS,
  isSafeInternalRedirect,
  readDummyAuth,
  resolveRedirectTarget,
  writeDummyAuth,
} from '~/utils/dummy-auth'

function createStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }

  return {
    data,
    getItem(key: string): string | null {
      return key in data ? data[key]! : null
    },
    setItem(key: string, value: string): void {
      data[key] = value
    },
    removeItem(key: string): void {
      delete data[key]
    },
  }
}

describe('dummy auth helpers', () => {
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

describe('dummy auth session expiry (SEC-03)', () => {
  const now = 1_700_000_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads true for a flag with an unexpired expiry stamp', () => {
    const storage = createStorage({
      [DUMMY_AUTH_STORAGE_KEY]: '1',
      [DUMMY_AUTH_EXPIRY_STORAGE_KEY]: String(now + 1000),
    })

    expect(readDummyAuth(storage)).toBe(true)
    // Keys are preserved for a valid session.
    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBe('1')
  })

  it('reads false and clears keys once the expiry has passed', () => {
    const storage = createStorage({
      [DUMMY_AUTH_STORAGE_KEY]: '1',
      [DUMMY_AUTH_EXPIRY_STORAGE_KEY]: String(now - 1),
    })

    expect(readDummyAuth(storage)).toBe(false)
    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBeUndefined()
    expect(storage.data[DUMMY_AUTH_EXPIRY_STORAGE_KEY]).toBeUndefined()
  })

  it('treats a missing or NaN expiry stamp as expired and clears keys', () => {
    const missing = createStorage({ [DUMMY_AUTH_STORAGE_KEY]: '1' })
    expect(readDummyAuth(missing)).toBe(false)
    expect(missing.data[DUMMY_AUTH_STORAGE_KEY]).toBeUndefined()

    const nan = createStorage({
      [DUMMY_AUTH_STORAGE_KEY]: '1',
      [DUMMY_AUTH_EXPIRY_STORAGE_KEY]: 'not-a-number',
    })
    expect(readDummyAuth(nan)).toBe(false)
    expect(nan.data[DUMMY_AUTH_STORAGE_KEY]).toBeUndefined()
    expect(nan.data[DUMMY_AUTH_EXPIRY_STORAGE_KEY]).toBeUndefined()
  })

  it('returns false without touching storage when the flag is absent', () => {
    expect(readDummyAuth(createStorage())).toBe(false)
    expect(readDummyAuth(createStorage({ [DUMMY_AUTH_STORAGE_KEY]: '0' }))).toBe(false)
    expect(readDummyAuth(null)).toBe(false)
  })

  it('writes the flag plus an expiry ~now + TTL on login', () => {
    const storage = createStorage()

    writeDummyAuth(storage, true)

    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBe('1')
    expect(Number(storage.data[DUMMY_AUTH_EXPIRY_STORAGE_KEY])).toBe(now + DUMMY_AUTH_TTL_MS)
    // Round-trips as logged-in immediately after writing.
    expect(readDummyAuth(storage)).toBe(true)
  })

  it('honours a custom TTL on login', () => {
    const storage = createStorage()

    writeDummyAuth(storage, true, 5000)

    expect(Number(storage.data[DUMMY_AUTH_EXPIRY_STORAGE_KEY])).toBe(now + 5000)
  })

  it('clears both keys on logout', () => {
    const storage = createStorage({
      [DUMMY_AUTH_STORAGE_KEY]: '1',
      [DUMMY_AUTH_EXPIRY_STORAGE_KEY]: String(now + 1000),
    })

    writeDummyAuth(storage, false)

    expect(storage.data[DUMMY_AUTH_STORAGE_KEY]).toBeUndefined()
    expect(storage.data[DUMMY_AUTH_EXPIRY_STORAGE_KEY]).toBeUndefined()
  })
})

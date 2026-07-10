import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SECURITY_LOG_CAPACITY,
  clearSecurityLog,
  recentSecurityEvents,
  recordSecurityEvent,
} from '~/utils/security-log'

describe('security log (SEC-16)', () => {
  beforeEach(() => {
    clearSecurityLog()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    clearSecurityLog()
    vi.restoreAllMocks()
  })

  it('records an event with type, level, timestamp and optional detail', () => {
    const event = recordSecurityEvent('auth.login', 'info', 'hello')

    expect(event.type).toBe('auth.login')
    expect(event.level).toBe('info')
    expect(event.detail).toBe('hello')
    expect(typeof event.ts).toBe('string')
    expect(recentSecurityEvents()).toHaveLength(1)
  })

  it('omits detail when not provided', () => {
    const event = recordSecurityEvent('auth.logout')
    expect(event.detail).toBeUndefined()
    expect(event.level).toBe('info')
  })

  it('routes level to the matching console sink', () => {
    recordSecurityEvent('auth.login', 'info')
    recordSecurityEvent('storage.quota_low', 'warn')
    recordSecurityEvent('storage.write_failed', 'error')

    expect(console.info).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('caps the ring buffer, dropping the oldest events', () => {
    for (let i = 0; i < SECURITY_LOG_CAPACITY + 25; i += 1) {
      recordSecurityEvent('data.import', 'info', String(i))
    }

    const events = recentSecurityEvents()
    expect(events).toHaveLength(SECURITY_LOG_CAPACITY)
    // Oldest 25 dropped; first retained event is #25.
    expect(events[0]!.detail).toBe('25')
    expect(events.at(-1)!.detail).toBe(String(SECURITY_LOG_CAPACITY + 24))
  })

  it('returns a copy so callers cannot mutate the buffer', () => {
    recordSecurityEvent('data.export')
    const snapshot = recentSecurityEvents()
    snapshot.push({ ts: 'x', type: 'auth.login', level: 'info' })
    expect(recentSecurityEvents()).toHaveLength(1)
  })
})

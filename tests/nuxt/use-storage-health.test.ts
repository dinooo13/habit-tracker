import { beforeEach, describe, expect, it } from 'vitest'
import { useStorageHealth } from '~/composables/use-storage-health'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/observability/security-log'

// The lifecycle transitions live on the reactive composable (useState-backed), so
// they run in the Nuxt project. The pure backoff/quota helpers are unit-tested
// separately in tests/storage-health.test.ts.
describe('useStorageHealth lifecycle (#65)', () => {
  beforeEach(() => {
    clearSecurityLog()
    // Reset the shared useState so each test starts from a known `ok` baseline.
    const health = useStorageHealth()
    health.status.value = 'ok'
    health.lastSavedAt.value = null
    health.lastError.value = null
  })

  it('markSaved sets the timestamp, clears the error, and logs recovery when previously degraded', () => {
    const health = useStorageHealth()
    health.reportWriteFailure(new Error('locked'))
    expect(health.status.value).toBe('failed')

    clearSecurityLog()
    health.markSaved()

    expect(health.status.value).toBe('ok')
    expect(health.lastSavedAt.value).not.toBeNull()
    expect(health.lastError.value).toBeNull()
    const recovered = recentSecurityEvents().filter(event => event.type === 'storage.recovered')
    expect(recovered).toHaveLength(1)
  })

  it('markSaved does not log recovery on the happy path', () => {
    const health = useStorageHealth()
    health.markSaved()
    expect(recentSecurityEvents().some(event => event.type === 'storage.recovered')).toBe(false)
  })

  it('reportWriteFailure transitions to failed, records the error, and logs write_failed', () => {
    const health = useStorageHealth()
    health.reportWriteFailure(new Error('disk hiccup'))

    expect(health.status.value).toBe('failed')
    expect(health.lastError.value).toContain('disk hiccup')
    expect(recentSecurityEvents().some(event => event.type === 'storage.write_failed')).toBe(true)
  })

  it('markUnavailable transitions to unavailable and logs once per episode', () => {
    const health = useStorageHealth()
    health.markUnavailable('quota')
    expect(health.status.value).toBe('unavailable')

    // A second call while already unavailable must not re-log.
    health.markUnavailable('retries-exhausted')
    const unavailable = recentSecurityEvents().filter(event => event.type === 'storage.unavailable')
    expect(unavailable).toHaveLength(1)
  })

  it('requestRetry bumps the retry token', () => {
    const health = useStorageHealth()
    const before = health.retryToken.value
    health.requestRetry()
    expect(health.retryToken.value).toBe(before + 1)
  })
})

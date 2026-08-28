import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStorageHealth } from '~/composables/use-storage-health'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/observability/security-log'

// The lifecycle transitions live on the reactive composable (useState-backed), so
// they run in the Nuxt project. The pure backoff/quota helpers are unit-tested
// separately in tests/storage-health.test.ts.
describe('useStorageHealth lifecycle (#65)', () => {
  beforeEach(() => {
    clearSecurityLog()
    // Reset the shared useState so each test starts from a known `ok` baseline.
    // markSaved() clears the sticky "degraded since ok" flag through the public
    // API; clear the log again afterwards to drop any recovery event it logged.
    const health = useStorageHealth()
    health.markSaved()
    health.status.value = 'ok'
    health.lastSavedAt.value = null
    health.lastError.value = null
    clearSecurityLog()
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

  it('logs recovery through the real save sequence: reportWriteFailure → markSaving → markSaved', () => {
    // Regression for the QA finding: the save path calls markSaving() (status →
    // `saving`) before the recovering attempt resolves, so markSaved must not
    // rely on `status` still reading `failed`/`unavailable` to detect recovery.
    const health = useStorageHealth()
    health.reportWriteFailure(new Error('locked'))
    expect(health.status.value).toBe('failed')
    health.markSaving()
    expect(health.status.value).toBe('saving')

    clearSecurityLog()
    health.markSaved()

    expect(health.status.value).toBe('ok')
    const recovered = recentSecurityEvents().filter(event => event.type === 'storage.recovered')
    expect(recovered).toHaveLength(1)
  })

  it('logs recovery after exiting unavailable via markSaving → markSaved', () => {
    const health = useStorageHealth()
    health.markUnavailable('quota')
    health.markSaving()

    clearSecurityLog()
    health.markSaved()

    expect(health.status.value).toBe('ok')
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

  describe('diagnostics state (#73)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('checkQuota retains the estimate and keeps the low-quota path', async () => {
      const health = useStorageHealth()
      health.estimate.value = null
      vi.stubGlobal('navigator', {
        storage: { estimate: () => Promise.resolve({ usage: 400, quota: 1000 }) },
      })

      const low = await health.checkQuota()

      expect(low).toBe(false)
      expect(health.estimate.value).toEqual({ usage: 400, quota: 1000 })
    })

    it('checkQuota fills missing figures with 0', async () => {
      const health = useStorageHealth()
      health.estimate.value = null
      vi.stubGlobal('navigator', {
        storage: { estimate: () => Promise.resolve({ usage: 200 }) },
      })

      await health.checkQuota()

      expect(health.estimate.value).toEqual({ usage: 200, quota: 0 })
    })

    it('setPersisted records the grant', () => {
      const health = useStorageHealth()
      health.setPersisted(true)
      expect(health.persisted.value).toBe(true)
      health.setPersisted(false)
      expect(health.persisted.value).toBe(false)
    })

    it('recordReconcile stores the counts and stamps an ISO timestamp', () => {
      const health = useStorageHealth()
      health.recordReconcile({ missedEntriesCreated: 3, suggestionsCreated: 2 })

      expect(health.lastReconcile.value?.missedEntriesCreated).toBe(3)
      expect(health.lastReconcile.value?.suggestionsCreated).toBe(2)
      expect(health.lastReconcile.value?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(Number.isNaN(new Date(health.lastReconcile.value!.at).getTime())).toBe(false)
    })
  })
})

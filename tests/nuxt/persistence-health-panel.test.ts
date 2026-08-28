import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PersistenceHealthPanel from '~/components/PersistenceHealthPanel.vue'
import { useStorageHealth } from '~/composables/use-storage-health'
import { clearSecurityLog, recordSecurityEvent } from '~/utils/observability/security-log'

// Reset the shared storage-health useState to a known baseline between tests.
function resetHealth(): void {
  const health = useStorageHealth()
  health.status.value = 'ok'
  health.lastSavedAt.value = null
  health.estimate.value = null
  health.persisted.value = null
  health.lastReconcile.value = null
}

describe('PersistenceHealthPanel (#73)', () => {
  beforeEach(() => {
    clearSecurityLog()
    resetHealth()
  })

  it('renders estimate, persist grant, status, and reconcile counts', async () => {
    const health = useStorageHealth()
    health.status.value = 'ok'
    health.persisted.value = true
    health.estimate.value = { usage: 400 * 1024 ** 2, quota: 1024 ** 3 }
    health.lastReconcile.value = { missedEntriesCreated: 3, suggestionsCreated: 2, at: '2026-08-28T10:00:00.000Z' }

    const wrapper = await mountSuspended(PersistenceHealthPanel)
    const text = wrapper.text()

    expect(text).toContain('Granted')
    // 400 MiB of 1 GiB → round(400/1024 * 100) = 39%
    expect(text).toContain('39%')
    expect(text).toContain('400 MiB of 1 GiB')
    expect(text).toContain('OK')
    expect(text).toContain('3 missed backfilled')
    expect(text).toContain('2 suggestions generated')
  })

  it('handles unknown estimate, unknown grant, and an empty event log', async () => {
    const health = useStorageHealth()
    health.estimate.value = null
    health.persisted.value = null
    health.lastReconcile.value = null

    const wrapper = await mountSuspended(PersistenceHealthPanel)
    const text = wrapper.text()

    expect(text).toContain('Not available')
    expect(text).toContain('Unknown')
    expect(text).toContain('No events yet this session.')
  })

  it('shows "No changes on last check" when both reconcile counts are zero', async () => {
    const health = useStorageHealth()
    health.lastReconcile.value = { missedEntriesCreated: 0, suggestionsCreated: 0, at: '2026-08-28T10:00:00.000Z' }

    const wrapper = await mountSuspended(PersistenceHealthPanel)
    expect(wrapper.text()).toContain('No changes on last check')
  })

  it('re-pulls events newest-first when Refresh is clicked', async () => {
    const wrapper = await mountSuspended(PersistenceHealthPanel)
    // Mounted with an empty log.
    expect(wrapper.text()).toContain('No events yet this session.')

    recordSecurityEvent('auth.login', 'info', 'signed in')
    const buttons = wrapper.findAll('button')
    const refresh = buttons.find(button => button.text().includes('Refresh'))
    expect(refresh).toBeTruthy()
    await refresh!.trigger('click')

    const text = wrapper.text()
    expect(text).toContain('auth.login')
    expect(text).toContain('signed in')
    expect(text).not.toContain('No events yet this session.')
  })
})

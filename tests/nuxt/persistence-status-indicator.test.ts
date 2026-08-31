import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import PersistenceStatusIndicator from '~/components/PersistenceStatusIndicator.vue'
import { useStorageHealth } from '~/composables/use-storage-health'
import { useDataRecovery } from '~/composables/use-data-recovery'
import { resetCrossTabSync, useCrossTabSync } from '~/composables/use-cross-tab-sync'
import { nowIso } from '~/utils/domain/date'
import { clearSecurityLog, recentSecurityEvents } from '~/utils/observability/security-log'

const { toastAdd, loadQuarantine, clearQuarantine } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  loadQuarantine: vi.fn(),
  clearQuarantine: vi.fn(),
}))

mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  update: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  toasts: [],
}))

mockNuxtImport('usePersistence', () => () => ({
  load: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  loadQuarantine,
  clearQuarantine,
}))

describe('PersistenceStatusIndicator (#65)', () => {
  beforeEach(() => {
    const health = useStorageHealth()
    health.status.value = 'ok'
    health.lastSavedAt.value = null
    useDataRecovery().quarantine.value = null
    resetCrossTabSync()
    loadQuarantine.mockReset()
    clearQuarantine.mockReset()
  })

  afterEach(() => {
    toastAdd.mockReset()
  })

  it('renders nothing before the first save on the happy path', async () => {
    const wrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(wrapper.text()).toBe('')
  })

  it('shows a quiet "Saved" pill (no banner) once there is a last-saved time', async () => {
    const health = useStorageHealth()
    health.status.value = 'ok'
    health.lastSavedAt.value = nowIso()

    const wrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(wrapper.text()).toContain('Saved')
    expect(wrapper.text()).not.toContain('Export backup')
  })

  it('shows no banner while saving or retrying', async () => {
    const health = useStorageHealth()

    health.status.value = 'saving'
    const savingWrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(savingWrapper.text()).not.toContain('Export backup')

    health.status.value = 'failed'
    const failedWrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(failedWrapper.text()).toContain('Retrying')
    expect(failedWrapper.text()).not.toContain('Export backup')
  })

  it('auto-hides the "Saved" pill 10s after settling on ok, and brings it back on the next save', async () => {
    vi.useFakeTimers()
    try {
      const health = useStorageHealth()
      health.status.value = 'ok'
      health.lastSavedAt.value = nowIso()

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      expect(wrapper.text()).toContain('Saved')

      // Just before 10s it is still visible.
      vi.advanceTimersByTime(9_000)
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Saved')

      // At 10s the quiet pill disappears.
      vi.advanceTimersByTime(1_000)
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).not.toContain('Saved')

      // A subsequent save reappears the pill and restarts the timer.
      health.status.value = 'saving'
      health.status.value = 'ok'
      health.lastSavedAt.value = nowIso()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Saved')

      vi.advanceTimersByTime(10_000)
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).not.toContain('Saved')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('shows the recovery banner with Export/Retry actions when unavailable', async () => {
    const health = useStorageHealth()
    health.status.value = 'unavailable'

    const wrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(wrapper.text()).toContain('being saved to this device')
    expect(wrapper.text()).toContain('Export backup')
    expect(wrapper.text()).toContain('Retry now')
  })

  describe('cross-tab conflict (#67)', () => {
    it('renders the conflict banner with Export/Reload actions and keeps other banners in order', async () => {
      useDataRecovery().quarantine.value = { capturedAt: nowIso(), reason: 'bad data' }
      useCrossTabSync().conflict.value = [
        { kind: 'habit', key: 'h1', label: 'Morning run', cause: 'both-modified' },
      ]

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      expect(wrapper.text()).toContain('Another tab changed the same things')
      expect(wrapper.text()).toContain('Morning run')
      expect(wrapper.text()).toContain('Export this tab')
      expect(wrapper.text()).toContain('Reload with latest')
      // The quarantine banner still renders alongside it.
      expect(wrapper.text()).toContain('Export preserved data')
    })

    it('shows the "Updated from another tab" pill and auto-hides it after 10s', async () => {
      vi.useFakeTimers()
      try {
        const wrapper = await mountSuspended(PersistenceStatusIndicator)
        useCrossTabSync().lastRemoteAppliedAt.value = nowIso()
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('Updated from another tab')

        vi.advanceTimersByTime(10_000)
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).not.toContain('Updated from another tab')
      }
      finally {
        vi.useRealTimers()
      }
    })
  })

  describe('data-recovery banner (#66)', () => {
    afterEach(() => {
      clearSecurityLog()
    })

    it('renders when a quarantined payload is present', async () => {
      useDataRecovery().quarantine.value = { capturedAt: nowIso(), reason: 'bad data' }

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      expect(wrapper.text()).toContain('Your saved data')
      expect(wrapper.text()).toContain('Export preserved data')
      expect(wrapper.text()).toContain('Dismiss')
    })

    it('does not render when there is no quarantine', async () => {
      useDataRecovery().quarantine.value = null

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      expect(wrapper.text()).not.toContain('Export preserved data')
    })

    it('Export preserved data downloads the payload, logs data.export, and toasts', async () => {
      clearSecurityLog()
      loadQuarantine.mockResolvedValue({
        id: 'latest',
        capturedAt: nowIso(),
        reason: 'bad data',
        payload: { schemaVersion: 1, habits: [{ id: 'broken' }] },
      })
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      useDataRecovery().quarantine.value = { capturedAt: nowIso(), reason: 'bad data' }

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      const exportButton = wrapper.findAll('button').find(button => button.text().includes('Export preserved data'))
      expect(exportButton).toBeTruthy()
      await exportButton!.trigger('click')
      await wrapper.vm.$nextTick()

      expect(loadQuarantine).toHaveBeenCalled()
      expect(recentSecurityEvents().some(event => event.type === 'data.export')).toBe(true)
      expect(toastAdd).toHaveBeenCalled()
    })

    it('Dismiss discards the quarantine, logs data.delete, and hides the banner', async () => {
      clearSecurityLog()
      clearQuarantine.mockResolvedValue(undefined)
      useDataRecovery().quarantine.value = { capturedAt: nowIso(), reason: 'bad data' }

      const wrapper = await mountSuspended(PersistenceStatusIndicator)
      const dismissButton = wrapper.findAll('button').find(button => button.text().includes('Dismiss'))
      expect(dismissButton).toBeTruthy()
      await dismissButton!.trigger('click')
      await wrapper.vm.$nextTick()

      expect(clearQuarantine).toHaveBeenCalledTimes(1)
      expect(useDataRecovery().quarantine.value).toBeNull()
      expect(recentSecurityEvents().some(event => event.type === 'data.delete')).toBe(true)
      expect(wrapper.text()).not.toContain('Export preserved data')
    })
  })
})

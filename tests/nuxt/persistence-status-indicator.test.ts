import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import PersistenceStatusIndicator from '~/components/PersistenceStatusIndicator.vue'
import { useStorageHealth } from '~/composables/use-storage-health'
import { nowIso } from '~/utils/domain/date'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  update: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  toasts: [],
}))

describe('PersistenceStatusIndicator (#65)', () => {
  beforeEach(() => {
    const health = useStorageHealth()
    health.status.value = 'ok'
    health.lastSavedAt.value = null
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

  it('shows the recovery banner with Export/Retry actions when unavailable', async () => {
    const health = useStorageHealth()
    health.status.value = 'unavailable'

    const wrapper = await mountSuspended(PersistenceStatusIndicator)
    expect(wrapper.text()).toContain('being saved to this device')
    expect(wrapper.text()).toContain('Export backup')
    expect(wrapper.text()).toContain('Retry now')
  })
})

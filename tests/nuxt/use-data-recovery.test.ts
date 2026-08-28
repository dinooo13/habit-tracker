import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useDataRecovery } from '~/composables/use-data-recovery'
import type { QuarantineRecord } from '~/utils/persistence/persistence-adapter'

const { loadQuarantine, clearQuarantine } = vi.hoisted(() => ({
  loadQuarantine: vi.fn(),
  clearQuarantine: vi.fn(),
}))

mockNuxtImport('usePersistence', () => () => ({
  load: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  loadQuarantine,
  clearQuarantine,
}))

function record(overrides: Partial<QuarantineRecord> = {}): QuarantineRecord {
  return {
    id: 'latest',
    capturedAt: '2026-08-28T12:00:00.000Z',
    reason: 'Invalid habit',
    payload: { schemaVersion: 1, habits: [{ id: 'broken' }] },
    ...overrides,
  }
}

describe('useDataRecovery (#66)', () => {
  beforeEach(() => {
    loadQuarantine.mockReset()
    clearQuarantine.mockReset()
    // Reset the shared reactive state between tests.
    useDataRecovery().quarantine.value = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refresh() surfaces quarantine metadata when a record exists', async () => {
    loadQuarantine.mockResolvedValue(record())

    const recovery = useDataRecovery()
    await recovery.refresh()

    expect(recovery.quarantine.value).toEqual({
      capturedAt: '2026-08-28T12:00:00.000Z',
      reason: 'Invalid habit',
    })
  })

  it('refresh() clears state and never throws when there is no quarantine', async () => {
    loadQuarantine.mockResolvedValue(null)

    const recovery = useDataRecovery()
    await recovery.refresh()

    expect(recovery.quarantine.value).toBeNull()
  })

  it('exportPreserved() downloads the raw payload and returns true', async () => {
    loadQuarantine.mockResolvedValue(record())
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const recovery = useDataRecovery()
    const exported = await recovery.exportPreserved()

    expect(exported).toBe(true)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
  })

  it('exportPreserved() returns false when nothing is quarantined', async () => {
    loadQuarantine.mockResolvedValue(null)

    const recovery = useDataRecovery()
    expect(await recovery.exportPreserved()).toBe(false)
  })

  it('discard() clears the adapter record and the reactive state', async () => {
    clearQuarantine.mockResolvedValue(undefined)
    const recovery = useDataRecovery()
    recovery.quarantine.value = { capturedAt: 'x', reason: 'y' }

    await recovery.discard()

    expect(clearQuarantine).toHaveBeenCalledTimes(1)
    expect(recovery.quarantine.value).toBeNull()
  })
})

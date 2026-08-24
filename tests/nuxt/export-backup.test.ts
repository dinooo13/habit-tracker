import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from '~/types/app-data'
import { APP_DATA_SCHEMA_VERSION, DEFAULT_SETTINGS } from '~/types/app-data'
import { downloadBackup } from '~/utils/persistence/export-backup'

// downloadBackup uses Blob/URL/anchor, so it runs in the Nuxt (happy-dom) project
// where `document` and `import.meta.client` are available.
function appData(): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

describe('downloadBackup (#65)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serializes the payload, triggers an anchor download, and revokes the URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadBackup(appData(), '2026-08-24')

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
  })
})

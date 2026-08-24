import { afterEach, describe, expect, it, vi } from 'vitest'
import { useClipboard } from '~/composables/use-clipboard'

describe('useClipboard (#69)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await useClipboard().copyText('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to a hidden textarea + execCommand when the Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true })

    await useClipboard().copyText('world')

    expect(execCommand).toHaveBeenCalledWith('copy')
    // The temporary textarea is cleaned up after the copy.
    expect(document.querySelector('textarea')).toBeNull()
  })
})

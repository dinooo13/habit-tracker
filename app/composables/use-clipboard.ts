/**
 * Clipboard write shim extracted from `settings.vue` (issue #69).
 *
 * Prefers the async Clipboard API (`navigator.clipboard.writeText`) and falls back
 * to a hidden-`textarea` + `document.execCommand('copy')` for older browsers.
 * Guarded with `import.meta.client` because both APIs are browser-only (`ssr: false`).
 * The success/error toasts stay in the page — those are a UI concern.
 */
export function useClipboard() {
  async function copyText(text: string): Promise<void> {
    if (!import.meta.client) {
      return
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  return { copyText }
}

import type { AppData } from '~/types/app-data'

/**
 * Serialize an app-data envelope and trigger a client-side file download
 * (issue #65). Used by the persistence-status recovery action so a user whose
 * storage is broken can still get their data out. Client-only: guarded with
 * `import.meta.client` because `Blob`/`URL`/anchor are browser APIs (`ssr: false`).
 *
 * The settings page keeps its own inline download for now; consolidating the two
 * definitions is deferred so this change stays scoped and does not collide with
 * the in-flight settings refactor (PR #77 / issue #69).
 */
export function downloadBackup(payload: AppData, dateKey: string): void {
  if (!import.meta.client) {
    return
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `habit-tracker-${dateKey}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

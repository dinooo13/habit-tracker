import type { AppData } from '~/types/app-data'

/**
 * Serialize an arbitrary payload to pretty JSON and trigger a client-side file
 * download under `filename`. Client-only: guarded with `import.meta.client`
 * because `Blob`/`URL`/anchor are browser APIs (`ssr: false`).
 */
function downloadJson(payload: unknown, filename: string): void {
  if (!import.meta.client) {
    return
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Serialize an app-data envelope and trigger a client-side file download
 * (issue #65). Used by the persistence-status recovery action so a user whose
 * storage is broken can still get their data out.
 *
 * The settings page keeps its own inline download for now; consolidating the two
 * definitions is deferred so this change stays scoped and does not collide with
 * the in-flight settings refactor (PR #77 / issue #69).
 */
export function downloadBackup(payload: AppData, dateKey: string): void {
  downloadJson(payload, `habit-tracker-${dateKey}.json`)
}

/**
 * Download a quarantined payload preserved when stored data failed to load
 * (issue #66, ADR-0019). The payload is `unknown` because it failed Zod
 * validation, but it is a plain object read straight from IndexedDB, so it
 * serializes fine. The `recovered-` filename prefix distinguishes it from a
 * clean backup so the user can tell recovery data apart.
 */
export function downloadRecoveredBackup(payload: unknown, dateKey: string): void {
  downloadJson(payload, `habit-tracker-recovered-${dateKey}.json`)
}

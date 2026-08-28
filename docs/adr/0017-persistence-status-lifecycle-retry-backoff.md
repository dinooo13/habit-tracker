# 17. Persistence status lifecycle with retry and backoff

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

SEC-18 (issue, `useStorageHealth`) surfaced storage write failures and low-quota warnings as
toasts and security events, but it modelled failure as only a last-error string plus a low-quota
boolean. There was no lifecycle (is a save in flight? did the last one succeed? are we in a
terminal failure?), no last-successful-save time, no retry on a transient write failure, and no
explicit recovery path. A user whose IndexedDB write fails — a locked database held by another
tab, a full disk, a private-mode browser that blocks storage — could keep editing indefinitely
with only a transient toast to warn them, and no obvious way to get their data out.

The `pagehide`/`visibilitychange` flush is best-effort by nature (the page may be unloading), so
we cannot *guarantee* a write; but we can make the risk visible and offer a recovery action.

## Decision

Model persistence as a first-class lifecycle with **exactly four states** —
`ok | saving | failed | unavailable` — extending `useStorageHealth()` rather than adding a second
observability composable (issue #65 says "extend the existing storage-health state"):

- **`ok`** — the last write succeeded (or nothing has been written yet).
- **`saving`** — a write is in flight.
- **`failed`** — a write failed and a retry is scheduled. Transient and self-clearing.
- **`unavailable`** — writes are terminally failing (retries exhausted, quota full, or the
  database could not be opened). The app-shell recovery banner is shown only here.

Supporting decisions:

- **State lives on `useStorageHealth`.** New reactive members: `status`, `lastSavedAt` (ISO string,
  **in-memory only** — persisting it would itself require a write and a schema bump for no user
  value), and `retryToken`; plus `markSaving`/`markSaved`/`markUnavailable`/`requestRetry`.
  `reportWriteFailure` is extended to set `status = 'failed'`. `markSaved` stamps `lastSavedAt`,
  clears the last error, and emits `storage.recovered` iff the prior state was degraded.
- **Retry orchestration stays at the bootstrap save path (ADR-0015), not in the composable and not
  in the adapter (ADR-0009).** A framework-free `createPersistenceSaver`
  (`app/utils/persistence/persistence-saver.ts`) owns the retry loop so it unit-tests without a
  Nuxt runtime; the pure `nextRetryDelay(attempt)` schedule lives in
  `app/utils/observability/storage-health.ts`. The 800ms edit debounce and the actual
  `persistence.save` binding remain inline in `bootstrap.client.ts`.
- **Backoff schedule:** exponential base 1s ×2, capped at 8s, at most 3 retries, ±20% jitter.
- **Quota errors skip retries** and go straight to `unavailable` — retrying a full disk just fails
  again; the user must export/prune.
- **New edits during a retry supersede the in-flight payload and reset the attempt counter** — the
  latest snapshot always wins.
- **Startup DB-open failure** is wrapped (`loadAppDataSafely`): the app hydrates empty state and
  marks `unavailable` rather than white-screening.
- **Teardown flush stays best-effort** — one plain save on `pagehide`/`hidden`, no retry loop,
  because the page may be unloading (the issue's acknowledged platform limit).
- **UI:** a quiet header pill (`Saved · {relative time}`, nothing before the first save, no
  "Saving…" flash on the happy path) plus a persistent `UAlert` recovery banner for `unavailable`
  with **Export backup** and **Retry now**, mirroring the existing PWA-update banner. The transient
  write-failure toast is suppressed while the banner is showing so a terminal failure isn't
  announced twice.
- **Observability:** two new security events, `storage.unavailable` and `storage.recovered`, mark
  entry into and exit from degraded mode (`storage.write_failed` already covers the transient case).

## Consequences

- **Pros:** failure is observable and recoverable; a transient write fault (e.g. another tab
  holding a Dexie transaction) self-heals via backoff without user action; a terminal fault gets an
  explicit export path instead of silent data-loss risk. The retry loop and backoff math are pure
  and unit-tested (fast `unit` project); the reactive transitions and the indicator render in the
  Nuxt project (ADR-0012).
- **Trade-offs:** `lastSavedAt` resets on reload (in-memory only); the `pagehide` flush is still
  best-effort; cross-tab save coordination is out of scope.
- **Supersedes nothing.** The schema (ADR-0006, ADR-0010), the persistence adapter (ADR-0009), the
  snapshot/debounce/flush strategy (ADR-0004), and the lifecycle composable (ADR-0015) are
  unchanged; this layers a status lifecycle and retry policy on top of them.

## References

- `app/composables/use-storage-health.ts` — the extended state.
- `app/utils/observability/storage-health.ts` — `PersistenceStatus`, `nextRetryDelay`, constants.
- `app/utils/persistence/persistence-saver.ts` — `createPersistenceSaver`, `loadAppDataSafely`.
- `app/plugins/bootstrap.client.ts` — wiring (saver, load fallback, retry token, teardown flush).
- `app/components/PersistenceStatusIndicator.vue`, `app/layouts/app.vue` — the shell indicator.
- `app/utils/persistence/export-backup.ts` — the recovery download.
- Tests: `tests/storage-health.test.ts`, `tests/persistence-saver.test.ts`,
  `tests/nuxt/use-storage-health.test.ts`, `tests/nuxt/persistence-status-indicator.test.ts`,
  `tests/nuxt/export-backup.test.ts`.
- ADR-0004 (snapshot persistence), ADR-0009 (persistence adapter), ADR-0012 (dual Vitest projects),
  ADR-0014 (utility taxonomy), ADR-0015 (app-data lifecycle). SEC-18; issue #65.
- ADR-0019 (quarantine invalid stored data on load failure) — adds a load-time recovery banner on
  the same indicator surface and hardens the open-failure path this ADR introduced.

# 19. Quarantine invalid stored data on load failure

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

When stored data failed Zod validation on boot, `DexiePersistenceAdapter.load()` logged the
failure (SEC-16) and fell back to empty state — but the database itself was healthy and writable.
The next debounced save then ran its `clear()` + `bulkPut` transaction and **overwrote the
still-present-but-invalid payload**, permanently destroying data that a schema fix or manual repair
could have recovered. The legacy `localStorage` system kept a last-valid backup; the Dexie rewrite
(ADR-0002) dropped it. There was also no user-facing recovery path — the reset was silent.

Separately, issue #65 (ADR-0017) wrapped boot load in `loadAppDataSafely` so a blocked/corrupt
IndexedDB degrades to empty state and `unavailable` instead of white-screening. But nothing stopped
the debounced auto-save watcher from *later* firing `clear()` + `bulkPut(empty)` against a database
that might be only partially broken — a second way recoverable data could be clobbered.

## Decision

Preserve invalid stored payloads instead of destroying them, surface a recovery path, and stop a
failed open from clobbering data.

- **Quarantine table (Dexie store version 1 → 2).** A dedicated `quarantine` table is registered by
  bumping the *Dexie store* version; the persisted `AppDataV2` shape is unchanged, so
  `APP_DATA_SCHEMA_VERSION` stays `2` and `migrateToV2`/`parseAppData` are untouched — the same
  store-vs-schema distinction ADR-0002/ADR-0010 already draw. The upgrade is additive and
  non-destructive.
- **Capture on validation failure.** Before returning empty, `load()` writes the raw reconstructed
  envelope (`{ schemaVersion, habits, entries, suggestions, settings }`) into the quarantine table,
  clear-then-put on a fixed key so **only the newest record** is kept (quarantined payloads consume
  quota). The normal `save()` transaction touches only `habits/entries/suggestions/meta`, so the
  quarantined data survives subsequent saves. The SEC-16 `data.validation_failed` log is kept. A
  quarantine write failure is caught and logged, never masking the original failure.
- **Adapter contract extension (ADR-0009).** `PersistenceAdapter` gains `loadQuarantine()` and
  `clearQuarantine()`; capture stays internal to `load()`. `clear()` (delete-all) also wipes
  quarantine — a deliberate full wipe should not leave an orphaned recovery banner.
- **Load-time recovery state — `useDataRecovery()`.** A new composable (backed by `useState`)
  exposes `quarantine` metadata plus `refresh()` / `exportPreserved()` / `discard()`. Kept
  **separate** from `useStorageHealth` so ADR-0017's save-lifecycle contract stays at exactly four
  states (`ok | saving | failed | unavailable`); quarantine is a load-time concern that merely
  shares the same UI surface.
- **Recovery banner.** `PersistenceStatusIndicator.vue` renders a second, `warning`-toned `UAlert`
  when a quarantine exists, with **Export preserved data** (downloads the raw JSON via
  `downloadRecoveredBackup`, logs `data.export`) and **Dismiss** (clears quarantine, logs
  `data.delete`). Distinct from the error-toned `unavailable` save banner.
- **Open-failure hardening.** `loadAppDataSafely` now returns `{ data, failed }`. On an open/read
  failure bootstrap sets `loadFailed` and **suppresses the debounced auto-save watcher** (read-only
  in-memory mode) so an idle edit can't clobber a partially-working database. The explicit "Retry
  now" → save path stays live so a user can still push in-memory edits once the DB is writable.
  Validation failures do **not** set `loadFailed` — the DB is healthy, quarantine already preserved
  the old data, so the fresh-start auto-save continues normally.

## Consequences

- **Pros:** invalid payloads are recoverable (exportable raw JSON) instead of silently destroyed; a
  failed open can no longer clobber recoverable data; the two degrade modes (validation failure vs.
  open failure) stay cleanly separated. The adapter and composable are unit-tested (fake-indexeddb /
  Nuxt project, ADR-0012).
- **Trade-offs:** one quarantined payload consumes quota (newest-only bounds it); partial/field-level
  salvage is out of scope — recovery is raw-JSON export plus manual re-import via Settings.
- **Supersedes nothing.** Extends ADR-0009 (adapter contract) and layers a load-time recovery pattern
  alongside ADR-0017's save-time lifecycle. The schema (ADR-0006, ADR-0010) and snapshot/debounce
  strategy (ADR-0004) are unchanged.

## References

- `app/utils/persistence/dexie-persistence-adapter.ts` — quarantine table, capture, load/clear.
- `app/utils/persistence/persistence-adapter.ts` — `QuarantineRecord`, contract extension.
- `app/composables/use-persistence.ts` — client-guarded `loadQuarantine`/`clearQuarantine`.
- `app/composables/use-data-recovery.ts` — reactive recovery state + actions.
- `app/components/PersistenceStatusIndicator.vue` — the recovery banner.
- `app/utils/persistence/export-backup.ts` — `downloadRecoveredBackup`.
- `app/utils/persistence/persistence-saver.ts` — `loadAppDataSafely` `{ data, failed }`.
- `app/plugins/bootstrap.client.ts` — `loadFailed` auto-save suppression + `refresh()` wiring.
- Tests: `tests/dexie-persistence-adapter.test.ts`, `tests/persistence-saver.test.ts`,
  `tests/nuxt/use-data-recovery.test.ts`, `tests/nuxt/persistence-status-indicator.test.ts`.
- ADR-0002 (Dexie storage), ADR-0009 (persistence adapter), ADR-0017 (persistence status lifecycle),
  ADR-0012 (dual Vitest projects). SEC-16; issue #66.

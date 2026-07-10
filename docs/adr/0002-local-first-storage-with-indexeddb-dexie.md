# 2. Local-first storage with IndexedDB/Dexie

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The app is a personal habit tracker with no requirement for accounts, sharing, or
cross-device sync. Habit history accumulates daily and the Insights view queries entries by
habit and date over long windows, so storage needs to scale beyond a few kilobytes and
support indexed lookups.

The original implementation persisted everything as a single JSON blob in `localStorage`.
That has real limits: a ~5 MB per-origin cap, synchronous (main-thread-blocking) I/O, no
indexes, and relatively aggressive eviction.

## Decision

Persist all application data in **IndexedDB**, accessed through **[Dexie](https://dexie.org/)**.
The schema (`app/utils/persistence/dexie-persistence-adapter.ts`) defines tables for `habits`, `entries` (indexed by
`habitId`, `date`, `status`), and `suggestions` (indexed by `entryId`, `createdAt`), plus a
`meta` table holding the settings object and schema version. Load/save/clear are implemented
as pure functions over the database so they are unit-testable with `fake-indexeddb`.

A one-time migration seeds any existing `localStorage` payload into Dexie on first load and
then removes the legacy keys. Existing IndexedDB data is never overwritten by legacy data.

Backup and transfer between devices is handled by **JSON export/import** on the Settings page
rather than a sync backend.

## Consequences

- **Pros:** far larger storage budget; non-blocking async I/O; indexed queries for
  habit/date/status; more durable persistence (further reinforced by requesting
  `navigator.storage.persist()` at startup).
- **Trade-offs:** the persistence API is asynchronous, so callers (the bootstrap plugin, demo
  loader, settings import/delete) must `await` it. Data remains **single-device** — there is
  no automatic sync, and loss of the device/browser profile means data loss unless the user
  has exported a JSON backup (a known UX gap tracked in the issues).
- Vue reactive proxies must be stripped (JSON-cloned) before writing, since IndexedDB uses
  structured clone — see ADR-0004.

## References

- `app/utils/persistence/dexie-persistence-adapter.ts` — Dexie schema and CRUD (the default
  `PersistenceAdapter`; see [ADR-0009](0009-persistence-adapter-interface.md)).
- `app/composables/use-persistence.ts` — load/save orchestration.
- `app/utils/persistence/legacy-migration.ts` — backend-agnostic legacy `localStorage` import.
- `app/plugins/bootstrap.client.ts` — `navigator.storage.persist()` request.
- Tracking: original migration issue #2 / PR #3.

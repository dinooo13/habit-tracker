# 9. Persistence adapter interface

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

Persistence was already abstracted at the *consumer* seam: every consumer
(`app/plugins/bootstrap.client.ts`, `app/pages/app/settings.vue`,
`app/composables/use-demo-data.ts`) touches storage only through
`usePersistence()`'s `load()` / `save()` / `clear()`, and `AppDataV1` — validated
by Zod in `app/utils/persistence/storage-schema.ts` independently of the backend — is the only
contract that crosses the boundary.

Swapping the backend was still not a drop-in, though:

- `use-persistence.ts` hard-wired the Dexie implementation — it imported the
  concrete functions from `~/utils/habit-database.ts` and constructed the database
  itself as a module-level singleton, so substituting a backend (or injecting a fake
  in tests) meant editing the composable.
- `habit-database.ts` bundled three concerns: the Dexie schema/class, generic
  load/save/clear orchestration, and the one-time legacy-`localStorage` migration.
- The legacy migration only existed on the Dexie branch, coupled to a
  `HabitDatabase` instance.

## Decision

Introduce a thin **`PersistenceAdapter`** interface
(`app/utils/persistence/persistence-adapter.ts`) with `load()`, `save()`, `clear()`, and
`hasData()`. `usePersistence()` depends on this interface, defaulting to the Dexie
backend but accepting an injected adapter.

- The Dexie code becomes **`DexiePersistenceAdapter`**
  (`app/utils/persistence/dexie-persistence-adapter.ts`, renamed from `habit-database.ts`)
  implementing the interface. The `HabitDatabase` schema/class is an internal
  detail; the database instance is constructor-injectable, replacing the old
  module-level singleton.
- The one-time legacy-`localStorage` migration moves to a backend-agnostic
  `migrateLegacyLocalStorage(adapter, storage)` in
  `app/utils/persistence/legacy-migration.ts`, depending only on `hasData`/`save` plus a
  `Storage`, so it runs regardless of the active backend.
- `usePersistence()` keeps the `import.meta.client` guards and the empty-state
  fallback, so adapters can assume a client environment.

`AppDataV1` + Zod (`storage-schema.ts`) remain the shared, backend-independent
serialization contract — unchanged.

This is a **non-behavioral refactor**: the public `usePersistence` surface and the
persisted data shape are identical, so existing user data and the
load → hydrate → reconcile → persist flow in `bootstrap.client.ts` are untouched.

## Consequences

- **Pros:** an alternative backend (OPFS/SQLite-WASM, an encrypted store per SEC-05
  in #1, or a sync backend) is now a drop-in that implements one interface; tests can
  inject an in-memory fake instead of the real Dexie DB; the three former concerns of
  `habit-database.ts` are separated.
- **Trade-offs:** one extra layer of indirection, justified by testability and a
  future backend swap.
- The Dexie/IndexedDB decision in [ADR-0002](0002-local-first-storage-with-indexeddb-dexie.md)
  still stands — Dexie is the *default* adapter, no longer the only path.

## References

- `app/utils/persistence/persistence-adapter.ts` — the interface.
- `app/utils/persistence/dexie-persistence-adapter.ts` — default Dexie implementation.
- `app/utils/persistence/legacy-migration.ts` — backend-agnostic legacy import.
- `app/composables/use-persistence.ts` — interface-dependent orchestration.
- `tests/dexie-persistence-adapter.test.ts`, `tests/legacy-migration.test.ts`.
- Supersedes no ADR; refines [ADR-0002](0002-local-first-storage-with-indexeddb-dexie.md).
- Extended by [ADR-0024](0024-revision-guarded-saves-with-cross-tab-merge.md) — `save` takes an
  `expectedRevision`, `load` returns `{ data, revision }`, and `readRevision()` is added for the
  cross-tab revision guard.
- Tracking: issue #13.

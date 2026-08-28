# 15. App-data lifecycle composable for snapshot/replace/reconcile

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

The four-store data lifecycle (`habits`, `entries`, `coach`, `settings`) was hand-rolled in
four places with subtly different persist payloads:

- `app/plugins/bootstrap.client.ts` — load → hydrate each store → apply palette → reconcile →
  build the debounced persist payload as an inline object literal.
- `app/pages/app/settings.vue` — full import, delete-all, and export each rebuilt the same
  envelope; `buildCurrentPayload()` and `persistCurrentState()` duplicated one another.
- `app/composables/use-demo-data.ts` — `hydrateDemoPayload` repeated the hydrate/reconcile/save
  sequence behind an injected-store dependency bundle.

Several of these writers spelled the literal `schemaVersion: 2` instead of the
`APP_DATA_SCHEMA_VERSION` constant, and the hydrate/reconcile *order* (which is load-bearing —
suggestions derive from reconciled entries) lived in each copy independently. There was no single
definition of "the persist envelope" or "replace all app data", so the copies could drift.

## Decision

Introduce one composable, **`app/composables/use-app-data-lifecycle.ts`**, exposing exactly three
state-only functions:

- **`snapshotAppData(): AppData`** — the single definition of the persist/export envelope. Builds
  it from the four stores' `snapshot()` results, stamping `APP_DATA_SCHEMA_VERSION`.
- **`replaceAppData(data: AppData): void`** — whole-envelope replacement: `hydrate()` all four
  stores, then `applyPrimaryColorPalette(settings.primaryColor)`. Not for partial merges.
- **`reconcileDerivedState(dateKey = todayDateKey()): ReconcileSummary`** — `ensureMissedEntries`
  then `reconcileMissingSuggestions`, in that order. Returns the `{ missedEntriesCreated,
  suggestionsCreated, at }` counts the two store calls already produce (issue #73) so the
  bootstrap can surface boot/rollover reconcile activity in the persistence health panel;
  additive, so the import/delete-all call sites that ignore the return are unaffected.

All four call sites are migrated to compose these functions. The literal `schemaVersion: 2`
writers (`settings.vue`, `demo-data-generator.ts`) switch to the constant.

**It is a composable, not a `utils/` module.** ADR-0014 records that `app/utils/` holds *pure
helpers and contracts, not stateful service objects*, and that *orchestration already lives in
composables and `bootstrap.client.ts`*. A module that reads/writes four Pinia stores and applies
the UI palette is orchestration, so a `use*` composable — resolving the stores internally via
`useXStore()` — is the ADR-0014-consistent home. This is why the module lives under
`composables/` rather than the `utils/persistence/app-data-lifecycle.ts` path the issue text
proposed.

**The boundary is state-only.** UI side effects stay at the call sites: security-event logging,
backup-nudge export tracking, storage-quota checks, toasts, `syncDailyReviewTimeFromSettings`,
notification-permission refresh, and the actual `persistence.save()` / debounce / flush strategy
(ADR-0004). The composable never touches IndexedDB and never raises UI. `snapshot` and
`reconcile` stay two functions rather than one so the habits-only import and delete-all paths can
replace without forcing a full reconcile.

## Consequences

- **Pros:** the persist payload, the `schemaVersion` source, and the hydrate/reconcile order are
  each defined once; the four call sites shrink to intention-revealing calls; the stray
  `schemaVersion: 2` literals are gone.
- **Trade-offs:** the lifecycle now depends on Nuxt/Pinia auto-import context, so its tests run in
  the Nuxt runtime Vitest project (ADR-0012) against real stores rather than injected mocks.
- **Behavior-preserving.** Full import previously saved `{ ...parsed, entries, suggestions }`;
  post-reconcile `snapshotAppData()` yields the identical habits/settings plus reconciled
  entries/suggestions. Delete-all previously saved `{ ...empty, settings }`, which equals the
  empty envelope after `replaceAppData(createEmptyAppData())`. Applying the palette inside
  `replaceAppData` is idempotent and reaches the same end state the bootstrap `primaryColor`
  watch already produced. Supersedes no decision: the schema (ADR-0006, ADR-0010), persistence
  adapter (ADR-0009), coaching engine (ADR-0005), and debounce/flush (ADR-0004) are unchanged.

## References

- `app/composables/use-app-data-lifecycle.ts` — the composable.
- `app/plugins/bootstrap.client.ts`, `app/pages/app/settings.vue`,
  `app/composables/use-demo-data.ts` — migrated call sites.
- `tests/nuxt/app-data-lifecycle.test.ts`, `tests/nuxt/demo-data-loader.test.ts` — coverage.
- ADR-0004 (snapshot persistence), ADR-0012 (dual Vitest projects), ADR-0014 (utility taxonomy).
- Issue #53.

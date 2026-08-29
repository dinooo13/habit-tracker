# 22. Version-keyed schema-migration registry with a discriminated parse result

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

`parseAppData()` is the single boundary every stored and imported payload flows through: it
validates a current `AppDataV2` envelope and migrates a V1 (or legacy `localStorage`) payload up
via the bespoke `migrateToV2()` (ADR-0010). But it was a hard-coded two-version branch that
*returned or threw*: an `if (version === 2)`, an `if (version === 1 || undefined)`, and a
`throw` for anything else. Every caller — the Dexie adapter, the legacy migrator, the backup
importer, the settings page — wrapped it in a `try/catch` and collapsed all failure modes into
one. There was no way to tell "this backup is from a newer app version" from "this file is
corrupt", and adding a future V3 would mean another `if` in the same function plus another round
of exception plumbing.

Issue #66 (ADR-0019) deliberately sequenced this work *after* quarantine, so that an unknown or
unrecoverable version is preserved rather than wiped.

## Decision

Turn the hard-coded branch into a **version-keyed migration registry** behind a **discriminated
result**, without changing the stored schema.

- **Generic migration engine — `app/utils/persistence/schema-migrations.ts`.** A pure,
  version-agnostic walker (`runMigrationChain`) that takes a caller-supplied
  `ReadonlyMap<number, MigrationStep>` and walks from a source version to a target, applying one
  single-successor step per version. It **never throws**: a step's throw, a missing step, or an
  exceeded step cap are all captured into a discriminated `MigrationChainOk | MigrationChainError`.
  It knows nothing about habits, Zod, or `AppDataV2`, which keeps it testable in isolation and
  reusable for a future V3.
- **Registry data stays in `storage-schema.ts`.** The one real step (`v1->v2`, pairing
  `AppDataV1Schema.parse` with `migrateToV2`) lives beside the schemas it needs; the engine takes
  the registry as an argument, so there is no import cycle. `assertMigrationRegistryInvariants`
  runs at module load to reject a mis-edited chain (a hole, a duplicate `from`, or a step that
  skips a version), and a runtime `MAX_MIGRATION_STEPS` cap means a cyclic registry degrades to a
  captured error → quarantine rather than hanging the boot.
- **Discriminated parse result — `parseAppDataResult()`.** The new primitive returns
  `ok | migrated | unrecoverable`. `unrecoverable` carries a stable machine-readable `reason`
  (`oversized`, `unsupported-version`, `invalid-shape`, `migration-failed`) and a human-readable
  `message` the recovery banner and import toast render. `parseAppData()` is kept as a thin
  throwing wrapper derived from it, so the ~40 existing `expect(() => parseAppData(x)).toThrow()`
  assertions and the demo-fetch caller stay unchanged.
- **Registry contract.** Each step (a) validates its own input version, throwing to signal an
  invalid `from` envelope; (b) is pure and non-destructive; (c) advances by exactly one version.
  The engine re-validates the final output against the current `AppDataV2Schema`, so a buggy step
  can never put unvalidated data in a store.
- **Version resolution.** Only an *absent*/`null` `schemaVersion` (legacy `localStorage`) is
  treated as V1. A *present* but unrecognised value — including the string `'2'`, `99`, `1.5`, or
  a non-number — is `unsupported-version`, never coerced through the non-strict V1 schema (which
  would silently strip `habits[].pauses`). The `oversized` preflight (issue #35) still runs first.
- **Callers branch on status.** The Dexie adapter logs a new `data.migrated` SEC-16 event on a
  migrated load (no write during `load()` — the upgraded envelope reaches disk through the normal
  debounced save, ADR-0004) and quarantines `unrecoverable` with the better reason text. The
  legacy migrator and backup importer drop their `try/catch` for a status check; settings import
  uses a pure `describeImportOutcome()` helper to surface "this backup is from a newer version"
  vs. a generic parse error.

No schema change: `APP_DATA_SCHEMA_VERSION` stays `2`, the `HabitDatabase` Dexie store version
stays `2`, and `QuarantineRecord` is unchanged.

## Consequences

- **Pros:** a future V3 is a registry entry, not another `if`; failure modes are distinguishable
  and drive actionable copy; the parse boundary is exception-free, so callers switch on a status
  instead of catching. The engine is unit-testable in isolation (a synthetic multi-step registry
  proves multi-hop behavior without shipping a fake V3).
- **Trade-offs:** registry machinery is more code than a two-way branch, justified now that the
  seam is proven and low-cost. Migration stays one-way (ADR-0010) — no down-migrations.
- **Supersedes nothing.** Extends ADR-0006 (versioned Zod envelope) and generalizes ADR-0010's
  bespoke V1→V2 branch; ADR-0019's quarantine and ADR-0017's save lifecycle are untouched.

## References

- `app/utils/persistence/schema-migrations.ts` — generic engine, invariants, step cap.
- `app/utils/persistence/storage-schema.ts` — `SCHEMA_MIGRATIONS` registry, `parseAppDataResult`,
  `ParseAppDataResult`/`ParseFailureReason`, `parseAppData` wrapper.
- `app/utils/persistence/dexie-persistence-adapter.ts` — status branch, `data.migrated` log.
- `app/utils/persistence/legacy-migration.ts`, `app/utils/persistence/backup.ts`
  (`describeImportOutcome`), `app/pages/app/settings.vue` — result-based call sites.
- `app/utils/observability/security-log.ts` — `data.migrated` event type.
- Tests: `tests/schema-migrations.test.ts`, `tests/storage-schema.test.ts`, `tests/pause-mode.test.ts`,
  `tests/dexie-persistence-adapter.test.ts`, `tests/backup.test.ts`, `e2e/specs/settings.spec.ts`.
- ADR-0006 (versioned schema), ADR-0010 (AppDataV2/migrateToV2), ADR-0019 (quarantine), issue #68.

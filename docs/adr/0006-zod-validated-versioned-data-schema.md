# 6. Zod-validated, versioned data schema

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

All data is read back from untrusted-ish sources at runtime: IndexedDB (which can hold data
written by an older app version) and user-supplied JSON imports. A malformed or outdated
payload reaching the stores could crash the app or corrupt state. The data shape will also
evolve over time, so we need a way to know which version of the shape we are looking at.

## Decision

Wrap all persisted data in a **versioned envelope**, `AppDataV1`, carrying an explicit
`schemaVersion: 1` alongside `habits`, `entries`, `suggestions`, and `settings`
(`app/types/app-data.ts`). On every load or import, validate the raw object with a **Zod**
schema (`app/utils/storage-schema.ts`) before it touches a store. Validation failure is not
fatal: the app falls back to a well-formed empty state rather than throwing.

The explicit `schemaVersion` is the hook for future migrations: a later `AppDataV2` can be
introduced with an upgrade step keyed off the version number.

## Consequences

- **Pros:** corrupt or outdated data degrades gracefully instead of crashing; the boundary
  between persisted data and in-memory stores is type-safe at runtime as well as compile time;
  the version field gives a clear migration seam.
- **Trade-offs:** the Zod schema must be kept in sync with the TypeScript types and any new
  fields. The current schema validates structure and enums but does not enforce string-length
  bounds, so a hostile import can still carry oversized strings — see `SECURITY.md` (SEC-06)
  and issue #1.

## References

- `app/types/app-data.ts` — `AppDataV1`, `APP_DATA_SCHEMA_VERSION`, domain types.
- `app/utils/storage-schema.ts` — Zod schema, parse, empty-state fallback.
- `tests/storage-schema.test.ts` — validation behavior.

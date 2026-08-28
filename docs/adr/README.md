# Architecture Decision Records

This directory records the significant architectural decisions for the Atomic Habit Tracker.
An **ADR** captures a single decision, the context that forced it, and the consequences that
follow — so the *why* survives even as the code changes.

## Format

Each record follows a lightweight [MADR](https://adr.github.io/madr/)-style structure:

- **Status** — Proposed / Accepted / Superseded.
- **Context** — the forces and constraints at play.
- **Decision** — what we chose to do.
- **Consequences** — the resulting benefits and trade-offs.
- **References** — the implementing files.

These ADRs were written retroactively to document decisions already embodied in the code.

## When to add an ADR

Add a new record (next number in sequence) whenever a change alters something structural:
the data schema, the persistence layer, the auth model, a core dependency, or a cross-cutting
pattern. Never edit an accepted ADR to reverse it — add a new one and mark the old as
*Superseded by ADR-XXXX*. See [WORKFLOW.md](../WORKFLOW.md).

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-local-first-storage-with-indexeddb-dexie.md) | Local-first storage with IndexedDB/Dexie | Accepted |
| [0003](0003-nuxt-4-spa-ssr-disabled.md) | Nuxt 4 SPA with SSR disabled | Accepted |
| [0004](0004-pinia-stores-with-snapshot-persistence.md) | Pinia stores with snapshot persistence | Accepted |
| [0005](0005-deterministic-atomic-habits-coaching-engine.md) | Deterministic Atomic Habits coaching engine | Accepted |
| [0006](0006-zod-validated-versioned-data-schema.md) | Zod-validated, versioned data schema | Accepted |
| [0007](0007-client-side-dummy-auth.md) | Client-side dummy auth | Accepted |
| [0008](0008-pwa-best-effort-reminders.md) | PWA best-effort reminders | Accepted |
| [0009](0009-persistence-adapter-interface.md) | Persistence adapter interface | Accepted |
| [0010](0010-appdatav2-flexible-schedules-pause-ranges.md) | AppDataV2 — flexible schedules & pause ranges | Accepted |
| [0011](0011-absolute-session-timeout-for-dummy-auth.md) | Absolute session timeout for dummy auth | Accepted |
| [0012](0012-dual-vitest-projects-for-node-and-nuxt-runtime-tests.md) | Dual Vitest projects for Node and Nuxt runtime tests | Accepted |
| [0013](0013-nuxt-eslint-flat-config.md) | Nuxt ESLint flat config — repository-wide linting & formatting standard | Accepted |
| [0014](0014-intent-revealing-utility-taxonomy.md) | Intent-revealing utility taxonomy with explicit imports | Accepted |
| [0015](0015-app-data-lifecycle-composable.md) | App-data lifecycle composable for snapshot/replace/reconcile | Accepted |
| [0016](0016-habit-action-composable-owns-cross-store-transactions.md) | Habit-action composable owns cross-store entry/suggestion transactions | Accepted |
| [0017](0017-persistence-status-lifecycle-retry-backoff.md) | Persistence status lifecycle with retry and backoff | Accepted |
| [0018](0018-central-reactive-day-clock-service.md) | Central reactive day-clock service for midnight rollover | Accepted |
| [0019](0019-quarantine-invalid-stored-data-on-load-failure.md) | Quarantine invalid stored data on load failure | Accepted |

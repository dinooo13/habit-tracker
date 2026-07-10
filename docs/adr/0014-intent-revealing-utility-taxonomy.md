# 14. Intent-revealing utility taxonomy with explicit imports

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

`app/utils/` had grown into a flat grab-bag of 14 modules that mixed unrelated concerns:
domain logic (`atomic-rules.ts`, `date.ts`, `demo-data-generator.ts`, `id.ts`), persistence
infrastructure (`persistence-adapter.ts`, `dexie-persistence-adapter.ts`, `legacy-migration.ts`,
`storage-schema.ts`, `safe-json.ts`), a UI helper (`primary-color.ts`), auth support
(`dummy-auth.ts`, `route-mapping.ts`), and cross-cutting observability (`security-log.ts`,
`storage-health.ts`). A flat directory made ownership non-obvious and gave no guidance for where
new helpers belong. Every consumer already imports these modules **explicitly**
(`~/utils/<module>`); none relies on Nuxt's `utils/` auto-import, so a reorganization was verified
safe to perform as a pure move.

## Decision

Group the utility modules into **five intent-revealing subdirectories** under `app/utils/`, each
owning one kind of responsibility:

- **`domain/`** — framework-light business rules and shared domain primitives
  (`atomic-rules.ts`, `date.ts`, `demo-data-generator.ts`, `id.ts`).
- **`persistence/`** — data-boundary validation, serialization safety, migration, and adapters
  (`persistence-adapter.ts`, `dexie-persistence-adapter.ts`, `legacy-migration.ts`,
  `storage-schema.ts`, `safe-json.ts`).
- **`ui/`** — framework-light presentation helpers that describe or apply UI state
  (`primary-color.ts`).
- **`auth/`** — the dummy gate and the route decisions that support
  `app/middleware/auth.global.ts` (`dummy-auth.ts`, `route-mapping.ts`).
- **`observability/`** — cross-cutting, in-memory/client-only event and health signals
  (`security-log.ts`, `storage-health.ts`).

Modules keep their filenames and public APIs unchanged; consumers only gain a category segment in
their import path (`~/utils/domain/date`, `~/utils/persistence/storage-schema`, …).

**Imports stay explicit and direct.** We add **no** Nuxt `imports.dirs` configuration and **no**
barrel `index.ts` re-export layer. Explicit `~/utils/<category>/<module>` paths remain the policy
for this layer, keeping every dependency edge visible and greppable.

**`app/services/` is intentionally not created.** The application's orchestration already lives in
composables and `app/plugins/bootstrap.client.ts`; these utility modules are pure helpers and
contracts, not stateful service objects, so a service layer would be premature abstraction.

**Categories are intent labels, not strict dependency layers.** Cross-category imports are allowed
when they express a real, acyclic dependency. Two such edges exist today and are preserved:
`persistence/storage-schema` uses `domain/date` for date-key validation, and
`persistence/dexie-persistence-adapter` emits through `observability/security-log`. These do not
justify relocating `date.ts` or `security-log.ts` into `persistence/`.

## Consequences

- **Pros:** ownership and the "where does this belong?" question become obvious from the directory
  tree; the flat grab-bag is eliminated; the empty root level makes the taxonomy enforceable by
  review and search.
- **Trade-offs:** import paths are longer, and the move touched many import lines (mechanical
  churn across app source and tests).
- This ADR changes **code organization only**. It supersedes no existing decision — the schema
  (ADR-0006, ADR-0010), persistence contract (ADR-0002, ADR-0009), coaching engine (ADR-0005),
  and auth semantics (ADR-0007, ADR-0011) are unchanged.

## References

- `app/utils/{domain,persistence,ui,auth,observability}/` — the five categories.
- `nuxt.config.ts` — unchanged; no `imports.dirs`, no aliases added.
- Issue #33.

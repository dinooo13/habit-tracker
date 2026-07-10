# 13. Nuxt ESLint flat config as the repository-wide linting and formatting standard

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

The repository had no linter, formatter, or lint script. CI ran unit tests, typecheck,
static generation, and Playwright E2E, but had no static-quality gate (issue #30). In an
agent-driven workflow — where much of the code is written and refactored by automated agents
— a lint gate is the cheapest available drift guard, and formatting inconsistencies left
unguarded mean every later refactor PR mixes logic changes with reformatting noise. Landing
a linter is both a **core development dependency** decision and a **cross-cutting pattern**
(a repository-wide code-quality/formatting policy), which under `docs/WORKFLOW.md` requires
an ADR.

Key constraints: this is a Nuxt 4 + Vue 3 SPA (`ssr: false`, ADR-0003) with Vue SFCs,
auto-imports, and framework-generated typings, so the lint config must be Nuxt-aware rather
than a hand-rolled ESLint setup that duplicates and drifts from the framework's own
configuration.

## Decision

Adopt the **`@nuxt/eslint`** module with ESLint's **flat-config** format as the single
linting and formatting standard.

- The module is registered in `nuxt.config.ts` and generates a project-aware config at
  `.nuxt/eslint.config.mjs`. A minimal committed root `eslint.config.mjs` composes it via
  `withNuxt(...)`, leaving room for narrow overrides.
- **Formatting is owned by ESLint Stylistic** (`eslint.config.stylistic: true`), not Prettier.
  One tool, one config surface, no formatter/linter conflict.
- A root `.editorconfig` encodes the baseline whitespace conventions (UTF-8, LF, final
  newline, trailing-whitespace trim, two-space indent) for editors before ESLint runs.
- Two scripts keep check and mutation separate: `lint` (`eslint .`, read-only, non-zero exit
  on any violation) and `lint:fix` (`eslint . --fix`).
- `npm run lint` runs in the existing CI `test` job immediately after `npm ci`, **before**
  tests and typecheck, so cheap static failures stop the job early.
- The initial baseline was normalized with a single `lint:fix` pass (formatting only, no
  behavior change); the few non-autofixable findings were resolved manually.
- Suppressions are narrow and documented: test and e2e files relax
  `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-dynamic-delete` via a
  scoped `files:` override in `eslint.config.mjs`, because those are deliberate mock-store,
  malformed-payload, and mock-storage constructs rather than production patterns. No blanket
  source exclusions.
- The optional ESLint dev-server checker is **not** enabled; IDE integration plus explicit
  scripts provide feedback without slowing `npm run dev`.

## Consequences

- **Pros:** one Nuxt-aware config; formatting and lint enforced by a single tool; a fast,
  required CI gate that catches drift before review; later refactor PRs stay free of
  reformatting noise; `.editorconfig` aligns non-lintable files too.
- **Trade-offs:** the baseline autofix touched many files (a one-time mechanical diff); adds
  `@nuxt/eslint` + `eslint` as dev dependencies to maintain; the Stylistic ruleset is
  opinionated, so future rule tuning happens through `eslint.config.mjs`.
- **Out of scope:** Prettier, Husky/lint-staged/pre-commit hooks, mandatory editor
  extensions, dev-server linting, and stricter opinionated rules beyond the Nuxt-recommended
  + Stylistic baseline.

## References

- `nuxt.config.ts` — `@nuxt/eslint` module + `eslint.config.stylistic`.
- `eslint.config.mjs` — composed root flat config and the scoped test-file override.
- `.editorconfig` — editor whitespace baseline.
- `package.json` — `lint` / `lint:fix` scripts; `@nuxt/eslint` + `eslint` dev deps.
- `.github/workflows/ci.yml` — `npm run lint` as the first `test`-job gate.
- Issue #30.

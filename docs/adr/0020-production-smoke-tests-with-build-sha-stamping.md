# 20. Production deployment smoke tests with build-SHA stamping

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

Nothing verified `https://habits.fmeyer.dev` after a deploy. CI tests a *locally* built
and served copy — `playwright.config.ts` runs against `npm run build && npm run preview`
because that build is hermetic and serves under base `/`, sidestepping the `/pr-<n>/`
base-path difference of the deployed preview. The qa-tester agent tests the PR preview
before merge. After that, `deploy-production` mirrors the artifact to the host over FTPS
and the pipeline ends.

A green build and a successful `lftp` mirror can still leave production broken: a partial
or interrupted upload, host configuration, stale or missing chunks, service-worker
behavior, caching, or the base-path difference local E2E specifically avoids exercising.
The first signal today would be a human noticing.

**And there was no way to tell which build is live.** Nothing embedded the commit SHA — no
`version.json`, no meta tag. FTPS mirroring is not atomic and the host may cache, so a
check run immediately after deploy can be served the *previous* build and pass. Any smoke
test added without fixing that would return a false green on precisely the failure it
exists to catch.

## Decision

Add a post-deploy `production-smoke` job, gated on the deployed commit SHA actually being
live, that reuses the existing e2e specs against the live origin.

**1. Stamp every build with its commit SHA (prerequisite).** The existing `nitro:init` →
`close` hook in `nuxt.config.ts` (which already writes `.htaccess` into the output
`publicDir`) also writes `version.json` — `{ commit, builtAt }` — into the same
`.output/public` artifact that `deploy-production` mirrors. SHA resolution lives in a pure,
unit-tested helper `app/utils/observability/build-version.ts`
(`resolveCommitSha(env, gitSha)` → `COMMIT_SHA` ?? `GITHUB_SHA` ?? injected `git rev-parse`
?? `'unknown'`; `buildVersionPayload`). The hook injects the git reader (dynamic-imported
`node:child_process`, mirroring its `node:fs`/`node:path` imports), keeping the helper
Node-free and testable; a missing `.git` degrades to `'unknown'` rather than throwing. CI
passes `COMMIT_SHA: ${{ github.sha }}` to the `build` job so a push to `main` stamps the
merge commit = the deployed SHA the smoke job polls for.

**2. Conditional Playwright web server.** `playwright.config.ts` gains an explicit remote
mode: `E2E_SKIP_WEB_SERVER=1` ⇒ `webServer: undefined`, so with
`E2E_BASE_URL=https://habits.fmeyer.dev` Playwright starts nothing and drives the live
origin. Local/PR CI is unchanged (env unset ⇒ builds and serves as before).

**3. Reuse specs via a `@production` tag — do not duplicate.** The e2e fixtures are already
origin-agnostic (`authenticate()` sets the dummy-auth flag via an init script; `seedData()`
writes IndexedDB client-side), so they run unchanged against any origin. A small subset is
tagged `@production` (app shell renders; seeded data hydrates and survives a hard reload;
mobile navigation renders; manifest/icons/chunks/SW health; a deep-link + hard reload with
no unexpected console errors or failed same-origin requests). Tags are additive metadata —
tagged tests still run in the normal `e2e` job, so no test becomes production-only. The
`production-smoke` job selects them with `--grep @production` and `--retries=2`. Because the
app is client-only this is non-destructive by construction: all seeded state lives in the
disposable browser profile and nothing server-side is touched.

**4. SHA-poll gate, then the tagged subset.** The job's first step polls
`version.json?cachebust` on a short bounded window (~90s) and fails fast if the deployed SHA
never appears — this is what stops a stale or partially-mirrored build returning a false
green. There is no `continue-on-error`; the job goes red so it cannot be ignored. It runs
only the tagged subset, reusing the browser-cache step, and uploads the report/traces/
screenshots on failure.

**5. File one label-less issue on failure — no dedup.** On failure a `github-script` step
creates exactly one issue carrying a `<!-- routine:production-smoke -->` marker, the
deployed SHA, the run URL, which step failed, artifact pointers, and recommended labels as
*text* (`type: bug`, `priority: high`, `area: pwa`). It is created **label-less** so normal
triage stays the front door, and there is **no deduplication** — three bad deploys file
three issues, deliberately, because dedup logic that has to be correct costs more than the
noise it saves at this deploy volume. This requires `issues: write` scoped to the one job;
the workflow default stays `contents: read`. On success the job records the tested SHA in
the run summary and files nothing.

## Consequences

- **Pros:** production is verified after every deploy against the real origin, base path,
  service worker, and caching — the surfaces local E2E avoids; the SHA gate makes the check
  meaningful rather than a false green; one maintained spec set serves both PR CI and
  production.
- **Trade-offs:**
  - Adds a Playwright install + browser runtime to main-branch deploys (mitigated by the
    browser cache and the tagged-subset-only run).
  - Tagging couples production gating to specs that also serve PR CI — editing a tagged
    spec changes what gates production. Accepted: one maintained set beats two that rot.
  - No dedup means repeated failures pile up as separate issues.
  - **A red smoke test does not restore service.** `deploy-production` mirrors over FTPS
    with no previous-artifact retention, so a failure means production stays broken until a
    human acts; the output is a bug issue and a red check, not recovery. Automatic rollback
    is out of scope and needs its own issue (starting with retaining a previous artifact to
    roll back *to*, which does not exist today).
  - A short version-poll window trades certainty for speed: if propagation is slower than
    the bound, the job fails on a healthy deploy. Start short; widen only if that happens.
  - `issues: write`, however narrowly scoped, is new write authority in CI. The job never
    fixes, rolls back, pushes, or merges.
- A future backend would change the non-destructive property and would need its own test
  account and cleanup contract.
- Supersedes no decision. Related: ADR-0003 (SSR disabled — why the manifest/SW are
  client-injected and the deep-link fallback matters), ADR-0008 (PWA), ADR-0012 (Playwright
  is the e2e layer), and the existing `.htaccess` generate hook this extends.

## References

- `app/utils/observability/build-version.ts` — pure SHA-resolution + payload helper.
- `nuxt.config.ts` — `nitro:init` close hook writes `version.json` alongside `.htaccess`.
- `playwright.config.ts` — `E2E_SKIP_WEB_SERVER` remote mode.
- `e2e/specs/smoke.spec.ts`, `e2e/specs/persistence.spec.ts`, `e2e/specs/mobile-pwa.spec.ts`
  — the `@production`-tagged subset and the new deep-link/console-health walk.
- `.github/workflows/ci.yml` — `build` job `COMMIT_SHA` wiring and the `production-smoke` job.
- `tests/build-version.test.ts` — unit coverage for the helper.
- Issue #87.

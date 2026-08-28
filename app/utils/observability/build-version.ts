// Build-SHA stamp (ADR-0020). At `nuxt generate` close, the nitro hook in
// `nuxt.config.ts` writes the resolved commit SHA into `.output/public/version.json`
// so the post-deploy `production-smoke` job can confirm *which* build is live
// before it runs any assertion — a stale or partially-mirrored deploy would
// otherwise return a false green.
//
// These helpers are deliberately pure so Vitest can pin the SHA-resolution and
// payload shape without a build. The git fallback is injected by the caller (the
// hook dynamic-imports `node:child_process`), keeping this module free of any
// Node-only dependency and importable in any environment.

/** The shape written to `version.json`. Minimal by design (issue #87). */
export interface BuildVersionPayload {
  /** The deployed commit SHA, or `'unknown'` when it can't be resolved. */
  commit: string
  /** ISO-8601 timestamp of when the stamp was written. */
  builtAt: string
}

/**
 * Resolve the commit SHA to stamp into the build, in priority order:
 *   1. explicit `COMMIT_SHA` (passed from `github.sha` in CI),
 *   2. ambient `GITHUB_SHA`,
 *   3. the injected `gitSha()` resolver (`git rev-parse HEAD` for local builds),
 *   4. `'unknown'`.
 *
 * Pure given `env` and `gitSha`, so it is fully unit-testable. `gitSha` defaults
 * to a no-op returning `null` (a missing `.git` degrades to `'unknown'` rather
 * than throwing); the build hook injects a real reader.
 */
export function resolveCommitSha(
  env: Record<string, string | undefined> = {},
  gitSha: () => string | null = () => null,
): string {
  const fromEnv = env.COMMIT_SHA?.trim() || env.GITHUB_SHA?.trim()
  if (fromEnv) {
    return fromEnv
  }

  const fromGit = gitSha()?.trim()
  if (fromGit) {
    return fromGit
  }

  return 'unknown'
}

/** Build the `version.json` payload for a resolved SHA and a timestamp. */
export function buildVersionPayload(commit: string, now: Date = new Date()): BuildVersionPayload {
  return {
    commit,
    builtAt: now.toISOString(),
  }
}

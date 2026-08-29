// A pure, version-agnostic schema-migration engine (issue #68, ADR-0022).
//
// This module knows nothing about habits, Zod, or `AppDataV2`: it walks a
// caller-supplied registry of single-version steps from a source version up to a
// target version, capturing (never propagating) any step failure into a
// discriminated result. Keeping the walker generic is exactly what makes it
// testable in isolation and reusable for a future V3 — the domain-specific
// registry lives in `storage-schema.ts`, which passes it in.

/** One single-version migration step, keyed by the source version it consumes. */
export interface MigrationStep {
  /** Stable id for logging, e.g. `v1->v2`. */
  id: string
  /** Source schema version this step consumes. */
  from: number
  /** Target schema version this step produces. Must be `from + 1`. */
  to: number
  /**
   * Validate `payload` as the `from` version and return the `to`-shaped payload.
   * Throwing is the contract for "this payload is not a valid `from` envelope".
   */
  migrate: (payload: unknown) => unknown
}

/** A successful walk: the (possibly unchanged) payload plus the step ids applied. */
export interface MigrationChainOk {
  ok: true
  payload: unknown
  /** Applied step ids in order; `[]` when already at the target version. */
  steps: string[]
}

/** A failed walk. `failedStepId` is `null` when no step was registered for a version. */
export interface MigrationChainError {
  ok: false
  /** The id of the throwing step, or `null` when the chain had no step to take. */
  failedStepId: string | null
  /** The value a step threw, or `undefined` for a missing-step / cap failure. */
  error: unknown
}

// Belt-and-braces upper bound on how many steps a single walk may take. The
// registry invariant assertion already makes a cycle impossible, but the cap
// means a mis-edited registry degrades to a captured error (→ quarantine)
// instead of hanging the boot.
export const MAX_MIGRATION_STEPS = 32

/**
 * Walk `registry` from `fromVersion` to `targetVersion`, applying one step per
 * version. Never throws: a step's throw is captured into {@link MigrationChainError}.
 *
 * - Already at (or past) the target → `ok` with `steps: []` and the payload by reference.
 * - No step registered for the current version → `ok: false, failedStepId: null`.
 * - A step throws → `ok: false, failedStepId: step.id, error`.
 * - More than {@link MAX_MIGRATION_STEPS} hops → `ok: false, failedStepId: null`.
 */
export function runMigrationChain(
  payload: unknown,
  fromVersion: number,
  targetVersion: number,
  registry: ReadonlyMap<number, MigrationStep>,
): MigrationChainOk | MigrationChainError {
  let current: unknown = payload
  let version = fromVersion
  const steps: string[] = []
  let guard = 0

  while (version < targetVersion) {
    guard += 1
    if (guard > MAX_MIGRATION_STEPS) {
      return { ok: false, failedStepId: null, error: undefined }
    }

    const step = registry.get(version)
    if (!step) {
      return { ok: false, failedStepId: null, error: undefined }
    }

    try {
      current = step.migrate(current)
    }
    catch (error) {
      return { ok: false, failedStepId: step.id, error }
    }

    version = step.to
    steps.push(step.id)
  }

  return { ok: true, payload: current, steps }
}

/**
 * Assert that `registry` is a contiguous, strictly-increasing, single-successor
 * chain: every step advances by exactly one version (`to === from + 1`), each
 * source version is registered at most once, and (for a non-empty registry) the
 * `from` versions form an unbroken run. Throws a descriptive `Error` otherwise.
 *
 * Run at module load next to the real registry so a mis-edited chain fails fast,
 * and asserted in a unit test to guard a future V3 entry.
 */
export function assertMigrationRegistryInvariants(registry: ReadonlyMap<number, MigrationStep>): void {
  if (registry.size === 0) {
    return
  }

  const froms: number[] = []

  for (const [key, step] of registry) {
    if (step.from !== key) {
      throw new Error(`Migration registry key ${key} does not match step.from ${step.from} (${step.id})`)
    }
    if (!Number.isInteger(step.from) || !Number.isInteger(step.to)) {
      throw new Error(`Migration step ${step.id} has a non-integer version (${step.from} -> ${step.to})`)
    }
    if (step.to !== step.from + 1) {
      throw new Error(`Migration step ${step.id} must advance by one version (${step.from} -> ${step.to})`)
    }
    froms.push(step.from)
  }

  froms.sort((left, right) => left - right)
  for (let index = 1; index < froms.length; index += 1) {
    if (froms[index] === froms[index - 1]) {
      throw new Error(`Migration registry has duplicate step for version ${froms[index]}`)
    }
    if (froms[index] !== froms[index - 1]! + 1) {
      throw new Error(`Migration registry chain is not contiguous around version ${froms[index]}`)
    }
  }
}

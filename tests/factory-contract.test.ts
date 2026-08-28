import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Static contract test for the agent-factory manifest (.factory/factory.yml,
// ADR-0021). It guards the manifest against itself and against the repo — no
// network, no routines API. The suite is green on the first run because the
// manifest is DESCRIPTIVE: the three known drifts and the one knowingly
// unrealized ordering (reviewer.order_after rebaser) are declared, not hidden.
//
// What it enforces (issue #85 §3):
//   1. every `agent` / `prompt` path resolves to a file that exists (and prompts
//      are non-empty);
//   2. every label in `consumes` / `produces` / `queue.states` exists in
//      `.github/labels.yml`;
//   3. every non-empty `idempotency.marker` has exactly one producer stage and at
//      least one consumer stage (modelled as its own declaring stage — the per-SHA /
//      end-of-run / structural skip check reads the marker it wrote);
//   4. no produced state is left unconsumed, except states a human consumes
//      (`human-gate: true` stages) — needs-plan-review and approved;
//   5. every `order_after.realized` flag matches the value computed from the two
//      stages' crons, so a cron edit without re-annotating fails the build;
//   6. every stage declares `idempotency` explicitly with a `kind` in the enum
//      (`none` permitted here; tightened away by #86); and
//   7. every `runtime.schedule` respects the one-hour minimum cron interval.

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const abs = (rel: string): string => join(repoRoot, rel)

interface OrderAfter {
  stage: string
  realized: boolean
  note?: string
}

interface Stage {
  'name': string
  'agent': string
  'prompt': string
  'scope': 'issue' | 'pr' | 'repo'
  'queue': { states: string[], github: string }
  'consumes': string[]
  'produces': string[]
  'human-gate': boolean
  'idempotency': { 'kind': string, 'marker': string, 'self-heal': boolean }
  'runtime': { schedule: string, model: string, enabled: boolean, environment: string }
  'order_after': OrderAfter[]
  'concurrency': number
  'wip_limit': number | null
}

interface Manifest {
  version: number
  allowed_tools: string[]
  stages: Stage[]
}

const manifest = parse(readFileSync(abs('.factory/factory.yml'), 'utf8')) as Manifest
const stages = manifest.stages
const stageByName = new Map(stages.map(stage => [stage.name, stage]))

const labelsDoc = parse(readFileSync(abs('.github/labels.yml'), 'utf8')) as Array<{ name: string }>
const knownLabels = new Set(labelsDoc.map(label => label.name))

const IDEMPOTENCY_KINDS = new Set(['none', 'per-sha', 'structural', 'end-of-run'])
const SCOPES = new Set(['issue', 'pr', 'repo'])
const DAY_MINUTES = 24 * 60
// A dependent stage "realizes" its ordering when at least one prerequisite run is
// picked up by the next dependent run within the same pipeline cycle. The one
// declared-unrealized edge (rebaser 16:15 → next reviewer 06:00) has a 13h45m gap;
// every realized edge here picks up within ~5h15m. Twelve hours cleanly separates
// "same-cycle pickup" from "waits for the next morning" (issue #85 §1.1: "+14h").
const REALIZED_MAX_GAP_MINUTES = 12 * 60
// Minimum interval the routines allow between two runs of one schedule.
const MIN_CRON_INTERVAL_MINUTES = 60

/** Expand one cron field to concrete values. Supports `*` and comma lists — the
 * only forms the pipeline schedules use (no ranges or steps). */
function expandField(field: string, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max }, (_, i) => i)
  }
  return field.split(',').map(part => Number.parseInt(part, 10))
}

/** All local run times of a cron, as minutes-of-day, ascending and de-duplicated.
 * Only the minute and hour fields matter for daily schedules. */
function cronRunMinutes(cron: string): number[] {
  const [minute, hour] = cron.trim().split(/\s+/)
  const minutes = expandField(minute, 60)
  const hours = expandField(hour, 24)
  const runs = new Set<number>()
  for (const h of hours) {
    for (const m of minutes) {
      runs.add(h * 60 + m)
    }
  }
  return [...runs].sort((a, b) => a - b)
}

/** Forward distance on the 24h circle; a coincident time counts as a full day
 * (not "after"), so a dependent run at the same minute does not realize an order. */
function forwardGap(from: number, to: number): number {
  const gap = ((to - from) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES
  return gap === 0 ? DAY_MINUTES : gap
}

/** Smallest wait from any prerequisite run to the next dependent run. */
function minPickupGap(prereqCron: string, depCron: string): number {
  const prereqRuns = cronRunMinutes(prereqCron)
  const depRuns = cronRunMinutes(depCron)
  let best = Number.POSITIVE_INFINITY
  for (const p of prereqRuns) {
    for (const d of depRuns) {
      best = Math.min(best, forwardGap(p, d))
    }
  }
  return best
}

function computeRealized(prereqCron: string, depCron: string): boolean {
  return minPickupGap(prereqCron, depCron) < REALIZED_MAX_GAP_MINUTES
}

/** Smallest interval between two consecutive runs of one schedule (cyclic). */
function minRunInterval(cron: string): number {
  const runs = cronRunMinutes(cron)
  if (runs.length <= 1) {
    return DAY_MINUTES
  }
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < runs.length; i++) {
    best = Math.min(best, forwardGap(runs[i]!, runs[(i + 1) % runs.length]!))
  }
  return best
}

describe('factory manifest — shape', () => {
  it('declares version 1 and a top-level allowed_tools list', () => {
    expect(manifest.version).toBe(1)
    expect(Array.isArray(manifest.allowed_tools)).toBe(true)
    expect(manifest.allowed_tools.length).toBeGreaterThan(0)
  })

  it('names the seven pipeline stages exactly once each', () => {
    expect([...stageByName.keys()].sort()).toEqual(
      ['docs-auditor', 'implementer', 'planner', 'qa-tester', 'rebaser', 'reviewer', 'triage'],
    )
    expect(stageByName.size).toBe(stages.length)
  })

  it('gives every stage a scope in the enum', () => {
    for (const stage of stages) {
      expect(SCOPES.has(stage.scope), `${stage.name} scope=${stage.scope}`).toBe(true)
    }
  })
})

describe('factory manifest — file references (§3.1)', () => {
  it('resolves every agent path to an existing file', () => {
    for (const stage of stages) {
      expect(existsSync(abs(stage.agent)), `${stage.name}: ${stage.agent}`).toBe(true)
    }
  })

  it('resolves every prompt path to an existing, non-empty file', () => {
    for (const stage of stages) {
      const path = abs(stage.prompt)
      expect(existsSync(path), `${stage.name}: ${stage.prompt}`).toBe(true)
      expect(readFileSync(path, 'utf8').trim().length, `${stage.name} prompt empty`).toBeGreaterThan(0)
    }
  })
})

describe('factory manifest — labels exist in .github/labels.yml (§3.2)', () => {
  it('only references declared labels in queue.states / consumes / produces', () => {
    for (const stage of stages) {
      for (const label of [...stage.queue.states, ...stage.consumes, ...stage.produces]) {
        expect(knownLabels.has(label), `${stage.name} references unknown label "${label}"`).toBe(true)
      }
    }
  })
})

describe('factory manifest — marker producer/consumer invariant (§3.3)', () => {
  it('gives every non-empty marker exactly one producer and at least one consumer', () => {
    const markerStages = new Map<string, string[]>()
    for (const stage of stages) {
      const marker = stage.idempotency.marker
      if (marker !== '') {
        markerStages.set(marker, [...(markerStages.get(marker) ?? []), stage.name])
      }
    }
    expect(markerStages.size).toBeGreaterThan(0)
    for (const [marker, owners] of markerStages) {
      // A marker's stage both writes it and reads it back on the next run to skip —
      // so a single declaring stage is its one producer and its consumer.
      expect(owners, `marker ${marker} has multiple producers: ${owners.join(', ')}`).toHaveLength(1)
    }
  })
})

describe('factory manifest — transition graph has no orphan produced state (§3.4)', () => {
  it('every produced state is consumed by a stage or by a human (human-gate)', () => {
    const consumed = new Set(stages.flatMap(stage => stage.consumes))
    // States whose next consumer is a human are exempt: they leave the agent graph
    // deliberately (planner → needs-plan-review, qa → approved).
    const humanConsumed = new Set(stages.filter(stage => stage['human-gate']).flatMap(stage => stage.produces))
    for (const stage of stages) {
      for (const label of stage.produces) {
        expect(
          consumed.has(label) || humanConsumed.has(label),
          `produced state "${label}" (by ${stage.name}) is consumed by no stage and is not a human gate`,
        ).toBe(true)
      }
    }
    // Guard the exemption is load-bearing, not vacuous: needs-plan-review is the
    // orphan that only the human-gate exemption rescues.
    expect(consumed.has('status: needs-plan-review')).toBe(false)
    expect(humanConsumed.has('status: needs-plan-review')).toBe(true)
  })
})

describe('factory manifest — idempotency declared explicitly (§3.6)', () => {
  it('every stage declares idempotency with a kind in the enum', () => {
    for (const stage of stages) {
      expect(stage.idempotency, `${stage.name} missing idempotency`).toBeTruthy()
      expect(
        IDEMPOTENCY_KINDS.has(stage.idempotency.kind),
        `${stage.name} kind=${stage.idempotency.kind}`,
      ).toBe(true)
      expect(typeof stage.idempotency.marker, `${stage.name} marker type`).toBe('string')
      expect(typeof stage.idempotency['self-heal'], `${stage.name} self-heal type`).toBe('boolean')
    }
  })
})

describe('factory manifest — order_after realized matches the crons (§3.5)', () => {
  it('each realized flag equals the value computed from both stages’ schedules', () => {
    for (const stage of stages) {
      for (const dep of stage.order_after) {
        const prereq = stageByName.get(dep.stage)
        expect(prereq, `${stage.name} order_after unknown stage "${dep.stage}"`).toBeTruthy()
        const computed = computeRealized(prereq!.runtime.schedule, stage.runtime.schedule)
        expect(
          dep.realized,
          `${stage.name} order_after ${dep.stage}: declared realized=${dep.realized} `
          + `but crons (${prereq!.runtime.schedule} → ${stage.runtime.schedule}) compute ${computed}`,
        ).toBe(computed)
      }
    }
  })

  it('records the one knowingly-unrealized edge: reviewer.order_after rebaser', () => {
    const reviewer = stageByName.get('reviewer')!
    const edge = reviewer.order_after.find(dep => dep.stage === 'rebaser')
    expect(edge, 'reviewer must record its rebaser ordering intent').toBeTruthy()
    expect(edge!.realized).toBe(false)
    expect(edge!.note, 'an unrealized edge must carry a note').toBeTruthy()
  })

  it('is a real guard: rescheduling rebaser to just before reviewer would flip realized to true', () => {
    // Regression proof that a cron edit is caught. If rebaser moved to 05:00 (an
    // hour before the 06:00 reviewer), the declared realized=false would no longer
    // match the crons and the assertion above would fail.
    expect(computeRealized('15 16 * * *', '0 6,16 * * *')).toBe(false)
    expect(computeRealized('0 5 * * *', '0 6,16 * * *')).toBe(true)
  })
})

describe('factory manifest — schedules respect the one-hour minimum (§3.7)', () => {
  it('no schedule runs two jobs less than an hour apart', () => {
    for (const stage of stages) {
      expect(
        minRunInterval(stage.runtime.schedule),
        `${stage.name} schedule "${stage.runtime.schedule}" runs sub-hourly`,
      ).toBeGreaterThanOrEqual(MIN_CRON_INTERVAL_MINUTES)
    }
  })
})

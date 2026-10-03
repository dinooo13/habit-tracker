import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Static contract test for the agent-factory manifest (.factory/factory.yml,
// ADR-0021, ADR-0023, ADR-0025). It guards the manifest against itself and against the
// repo — no network, no T3 API (T3's task tools are reachable only from a T3 thread,
// never from CI). The suite is green because the manifest is DESCRIPTIVE: the one
// knowingly unrealized ordering (reviewer.order_after rebaser) is declared, not hidden.
//
// What it enforces:
//   1. every `agent` / `prompt` path resolves to a file that exists (and prompts
//      are non-empty);
//   2. every label in `consumes` / `produces` / `queue.states` exists in
//      `.github/labels.yml`;
//   3. no produced state is left unconsumed, except states a human consumes
//      (`human-gate: true` stages) — needs-plan-review and approved;
//   4. every `order_after.realized` flag matches the value computed from the two
//      stages' run times, so a schedule edit without re-annotating fails the build;
//   5. every `runtime.runs` list is well-formed (non-empty, unique, valid HH:MM) and
//      respects the one-hour pipeline-policy minimum between two runs of one stage;
//   6. schema is version 3 with a `scheduler:` block of the declared shape, the stages
//      describe exactly eleven T3 tasks, and every stage declares an `idempotency`
//      block whose `kind` is in the tightened enum and is never `none`
//      (ADR-0023 T1/T2), with a substantive `note` (T3);
//   7. the top-level `markers:` registry is well-formed — unique ids, one
//      `routine:{name}` family per entry, declared producer/consumer stages, a
//      non-empty `consumed_by`, `<!-- routine:` prefixes, and only the
//      {head, kind, base} placeholders (T5/T6);
//   8. every non-empty stage `idempotency.marker` resolves to exactly one registry
//      entry whose `produced_by` is that stage, and every guard kind that needs a
//      marker declares one (T4/T9); and
//   9. every marker's `routine:{name}` family is grounded by grep in its producer and
//      in every consumer agent file (T7), with the family/placeholder extractors
//      carrying their own negative-case proofs (T10); and
//  10. every stage pins a non-empty `runtime.model`, and its agent file's frontmatter
//      `model:` is the identical full id — the pin lives in two layers (manifest +
//      agent file) and this keeps them from drifting apart again.

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const abs = (rel: string): string => join(repoRoot, rel)

interface OrderAfter {
  stage: string
  realized: boolean
  note?: string
}

interface Idempotency {
  'kind': string
  'marker': string
  'self-heal': boolean
  'note': string
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
  'idempotency': Idempotency
  'runtime': { runs: string[], model: string, enabled: boolean }
  'order_after': OrderAfter[]
  'concurrency': number
  'wip_limit': number | null
}

interface Marker {
  id: string
  produced_by: string
  consumed_by: string[]
  purpose?: string
}

interface Scheduler {
  kind: string
  project: string
  task_name: string
  timezone: string
  thread: string
  worktree: string
  prompt_source: string
  model: string
  runs_only_while_host_up: boolean
}

interface Manifest {
  version: number
  scheduler: Scheduler
  allowed_tools: string[]
  markers: Marker[]
  stages: Stage[]
}

const manifest = parse(readFileSync(abs('.factory/factory.yml'), 'utf8')) as Manifest
const stages = manifest.stages
const stageByName = new Map(stages.map(stage => [stage.name, stage]))
const markers = manifest.markers
const markerById = new Map(markers.map(marker => [marker.id, marker]))

const labelsDoc = parse(readFileSync(abs('.github/labels.yml'), 'utf8')) as Array<{ name: string }>
const knownLabels = new Set(labelsDoc.map(label => label.name))

// `none` is gone (ADR-0023); a stage without a guard is no longer expressible.
const IDEMPOTENCY_KINDS = new Set(['per-sha', 'fingerprint', 'structural', 'end-of-run'])
// Kinds whose guard is a marker read back on the next run must declare one; a
// `structural` guard (branch/PR exists, branch is ahead) may leave `marker` empty.
const MARKER_REQUIRING_KINDS = new Set(['per-sha', 'fingerprint', 'end-of-run'])
// The only placeholders the marker templates use, each substituted per run.
const ALLOWED_PLACEHOLDERS = new Set(['head', 'kind', 'base'])
// A note is prose, not a placeholder: enough to record a mechanism and its reasoning.
const MIN_NOTE_LENGTH = 40
const SCOPES = new Set(['issue', 'pr', 'repo'])
const DAY_MINUTES = 24 * 60
// A dependent stage "realizes" its ordering when at least one prerequisite run is
// picked up by the next dependent run within the same pipeline cycle. The one
// declared-unrealized edge (rebaser 16:15 → next reviewer 06:00) has a 13h45m gap;
// every realized edge here picks up within ~5h15m. Twelve hours cleanly separates
// "same-cycle pickup" from "waits for the next morning" (issue #85 §1.1: "+14h").
const REALIZED_MAX_GAP_MINUTES = 12 * 60
// Pipeline policy, not a T3 limit: two runs of one stage stay at least an hour apart,
// because the idempotency guards are advisory and need the window to settle (ADR-0023).
const MIN_RUN_INTERVAL_MINUTES = 60
// What the eleven `runs` entries add up to (ADR-0025): one T3 scheduled task per stage
// per run time. A changed task count must therefore be a visible manifest edit.
const EXPECTED_TASK_COUNT = 11
// A machine-local run time, exactly as T3's `fixed_time.timeOfDay` accepts it.
const RUN_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** The `routine:{name}` family of a marker id — the stable prefix that a rename must
 * keep in sync across the manifest and the agent files. Extracts the
 * whitespace-delimited token beginning with `routine:`. */
function markerFamily(id: string): string {
  const token = id.split(/\s+/).find(part => part.startsWith('routine:'))
  if (token === undefined) {
    throw new Error(`marker id has no routine: family: ${id}`)
  }
  return token
}

/** Placeholder names templated into a marker id, e.g. `sha={head}` → `['head']`. */
function markerPlaceholders(id: string): string[] {
  return [...id.matchAll(/\{(\w+)\}/g)].map(match => match[1]!)
}

/** A stage's `runtime.runs` as minutes-of-day, ascending and de-duplicated. Each entry
 * is one T3 `fixed_time` task; a malformed time throws rather than silently parsing to
 * NaN, so a typo fails the build instead of skewing the ordering math. */
function runMinutes(runs: string[]): number[] {
  const minutes = new Set<number>()
  for (const run of runs) {
    if (!RUN_TIME.test(run)) {
      throw new Error(`runtime.runs entry is not a machine-local HH:MM time: "${run}"`)
    }
    const [hour, minute] = run.split(':')
    minutes.add(Number.parseInt(hour!, 10) * 60 + Number.parseInt(minute!, 10))
  }
  return [...minutes].sort((a, b) => a - b)
}

/** Forward distance on the 24h circle; a coincident time counts as a full day
 * (not "after"), so a dependent run at the same minute does not realize an order. */
function forwardGap(from: number, to: number): number {
  const gap = ((to - from) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES
  return gap === 0 ? DAY_MINUTES : gap
}

/** Smallest wait from any prerequisite run to the next dependent run. */
function minPickupGap(prereqRuns: string[], depRuns: string[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const p of runMinutes(prereqRuns)) {
    for (const d of runMinutes(depRuns)) {
      best = Math.min(best, forwardGap(p, d))
    }
  }
  return best
}

function computeRealized(prereqRuns: string[], depRuns: string[]): boolean {
  return minPickupGap(prereqRuns, depRuns) < REALIZED_MAX_GAP_MINUTES
}

/** Smallest interval between two consecutive runs of one stage (cyclic). */
function minRunInterval(runs: string[]): number {
  const minutes = runMinutes(runs)
  if (minutes.length <= 1) {
    return DAY_MINUTES
  }
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < minutes.length; i++) {
    best = Math.min(best, forwardGap(minutes[i]!, minutes[(i + 1) % minutes.length]!))
  }
  return best
}

describe('factory manifest — shape', () => {
  it('declares version 3 and a top-level allowed_tools list', () => {
    expect(manifest.version).toBe(3)
    expect(Array.isArray(manifest.allowed_tools)).toBe(true)
    expect(manifest.allowed_tools.length).toBeGreaterThan(0)
  })

  it('describes the T3 scheduled-task runtime in one top-level scheduler block', () => {
    // The shape is asserted, not the free-text values: `project`, `timezone`, and the
    // rest are prose for a reader, while these three carry the 1:N stage→task mapping
    // and the prompt contract the rest of the manifest is read against (ADR-0025).
    const scheduler = manifest.scheduler
    expect(scheduler, 'manifest declares no scheduler block').toBeTruthy()
    expect(scheduler.kind).toBe('t3-scheduled-task')
    expect(scheduler.task_name, 'task_name must template the stage').toContain('{stage}')
    expect(scheduler.task_name, 'task_name must template the run time').toContain('{time}')
    expect(scheduler.prompt_source, 'prompt_source must template the stage').toContain('{stage}')
  })

  it('describes exactly eleven T3 tasks across the seven stages', () => {
    const tasks = stages.reduce((total, stage) => total + stage.runtime.runs.length, 0)
    expect(tasks).toBe(EXPECTED_TASK_COUNT)
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

describe('factory manifest — idempotency kind is declared and tightened (ADR-0023 T1/T2)', () => {
  it('every stage declares idempotency with a kind in the tightened enum', () => {
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

  it('no stage declares kind: none (the drift ADR-0023 closes)', () => {
    // Asserted separately from the enum so the invariant survives an enum edit: a
    // future kind added to IDEMPOTENCY_KINDS still may not re-admit `none`.
    for (const stage of stages) {
      expect(stage.idempotency.kind, `${stage.name} must not declare kind: none`).not.toBe('none')
    }
    expect(IDEMPOTENCY_KINDS.has('none')).toBe(false)
  })
})

describe('factory manifest — every stage records a substantive note (ADR-0023 T3)', () => {
  it('gives every stage a non-empty idempotency.note of real prose', () => {
    for (const stage of stages) {
      const note = stage.idempotency.note
      expect(typeof note, `${stage.name} note type`).toBe('string')
      expect(
        (note ?? '').trim().length,
        `${stage.name} idempotency.note is missing or too short to be a real note`,
      ).toBeGreaterThanOrEqual(MIN_NOTE_LENGTH)
    }
  })
})

describe('factory manifest — marker family/placeholder extractors (ADR-0023 T10)', () => {
  it('extracts the routine:{name} family from a templated id', () => {
    expect(markerFamily('<!-- routine:code-review sha={head} -->')).toBe('routine:code-review')
    expect(markerFamily('<!-- routine:plan-issues -->')).toBe('routine:plan-issues')
    expect(markerFamily('<!-- routine:triage kind={kind} -->')).toBe('routine:triage')
  })

  it('throws when an id carries no routine: family (guard is not vacuous)', () => {
    expect(() => markerFamily('<!-- not-a-routine marker -->')).toThrow(/routine:/)
  })

  it('extracts placeholder names, and none from a static id', () => {
    expect(markerPlaceholders('<!-- routine:docs-audit base={base} -->')).toEqual(['base'])
    expect(markerPlaceholders('<!-- routine:qa sha={head} -->')).toEqual(['head'])
    expect(markerPlaceholders('<!-- routine:plan-issues -->')).toEqual([])
  })
})

describe('factory manifest — marker registry invariants (ADR-0023 T5/T6)', () => {
  it('has unique ids and one routine:{name} family per entry', () => {
    expect(markers.length).toBeGreaterThan(0)
    expect(markerById.size, 'duplicate marker id in registry').toBe(markers.length)
    const families = markers.map(marker => markerFamily(marker.id))
    expect(new Set(families).size, `two registry entries share a routine family: ${families.join(', ')}`)
      .toBe(families.length)
  })

  it('names declared stages for producer and consumers, with a non-empty consumed_by', () => {
    for (const marker of markers) {
      expect(stageByName.has(marker.produced_by), `${marker.id} produced_by unknown stage "${marker.produced_by}"`).toBe(true)
      expect(marker.consumed_by.length, `${marker.id} has an empty consumed_by`).toBeGreaterThan(0)
      for (const consumer of marker.consumed_by) {
        expect(stageByName.has(consumer), `${marker.id} consumed_by unknown stage "${consumer}"`).toBe(true)
      }
    }
  })

  it('gives every id an HTML-comment prefix and only allowed placeholders', () => {
    for (const marker of markers) {
      expect(marker.id.startsWith('<!-- routine:'), `${marker.id} lacks the <!-- routine: prefix`).toBe(true)
      expect(marker.id.trimEnd().endsWith('-->'), `${marker.id} is not a closed HTML comment`).toBe(true)
      for (const placeholder of markerPlaceholders(marker.id)) {
        expect(ALLOWED_PLACEHOLDERS.has(placeholder), `${marker.id} uses unknown placeholder {${placeholder}}`).toBe(true)
      }
    }
  })
})

describe('factory manifest — stage marker resolves to its registry entry (ADR-0023 T4/T9)', () => {
  it('resolves every non-empty stage marker to one registry entry it produces', () => {
    let resolved = 0
    for (const stage of stages) {
      const marker = stage.idempotency.marker
      if (marker === '') {
        continue
      }
      const entry = markerById.get(marker)
      expect(entry, `${stage.name} marker "${marker}" is not in the registry`).toBeTruthy()
      expect(
        entry!.produced_by,
        `${stage.name} declares marker "${marker}" but the registry credits ${entry!.produced_by}`,
      ).toBe(stage.name)
      resolved++
    }
    expect(resolved, 'no stage marker resolved — the check is vacuous').toBeGreaterThan(0)
  })

  it('requires a marker for guard kinds that read one back, and allows structural to omit it', () => {
    for (const stage of stages) {
      const { kind, marker } = stage.idempotency
      if (MARKER_REQUIRING_KINDS.has(kind)) {
        expect(marker, `${stage.name} kind=${kind} must declare a marker`).not.toBe('')
      }
      if (kind === 'structural') {
        // Structural stages MAY be empty — they claim with a branch/PR, not a comment.
        expect(typeof marker, `${stage.name} marker type`).toBe('string')
      }
    }
  })
})

describe('factory manifest — markers are grounded in the agent files (ADR-0023 T7)', () => {
  it('greps every marker family into its producer and each consumer agent file', () => {
    for (const marker of markers) {
      const family = markerFamily(marker.id)
      const consumers = new Set([marker.produced_by, ...marker.consumed_by])
      for (const stageName of consumers) {
        const stage = stageByName.get(stageName)!
        const agentSource = readFileSync(abs(stage.agent), 'utf8')
        expect(
          agentSource.includes(family),
          `${stageName} agent file does not mention marker family "${family}" (${marker.id})`,
        ).toBe(true)
      }
    }
  })

  it('is a real guard: a family only its producer names would fail for its consumers', () => {
    // Regression proof: routine:code-review is consumed by the implementer, so
    // implementer.md must mention it — not only reviewer.md.
    const implementerSource = readFileSync(abs(stageByName.get('implementer')!.agent), 'utf8')
    expect(implementerSource.includes('routine:code-review')).toBe(true)
    expect(implementerSource.includes('routine:qa')).toBe(true)
    expect(implementerSource.includes('routine:docs-audit')).toBe(true)
  })
})

describe('factory manifest — runs are well-formed (ADR-0025)', () => {
  it('gives every stage a non-empty list of unique, valid HH:MM run times', () => {
    for (const stage of stages) {
      const runs = stage.runtime.runs
      expect(Array.isArray(runs), `${stage.name} runtime.runs is not a list`).toBe(true)
      expect(runs.length, `${stage.name} declares no run times`).toBeGreaterThan(0)
      for (const run of runs) {
        expect(RUN_TIME.test(run), `${stage.name} run time "${run}" is not HH:MM`).toBe(true)
      }
      expect(
        new Set(runs).size,
        `${stage.name} repeats a run time (${runs.join(', ')}) — two tasks would share a name`,
      ).toBe(runs.length)
    }
  })

  it('declares a boolean enabled flag on every stage', () => {
    // Type check only: the value is descriptive, and all eleven tasks are currently
    // disabled pending a human smoke-test run (ADR-0025 decision 6).
    for (const stage of stages) {
      expect(typeof stage.runtime.enabled, `${stage.name} runtime.enabled type`).toBe('boolean')
    }
  })

  it('is a real guard: a malformed run time throws instead of parsing to NaN', () => {
    expect(() => runMinutes(['24:00'])).toThrow(/HH:MM/)
    expect(() => runMinutes(['2:00'])).toThrow(/HH:MM/)
    expect(() => runMinutes(['16:60'])).toThrow(/HH:MM/)
    expect(runMinutes(['02:00', '11:00'])).toEqual([120, 660])
  })
})

describe('factory manifest — order_after realized matches the run times (§3.5)', () => {
  it('each realized flag equals the value computed from both stages’ run times', () => {
    for (const stage of stages) {
      for (const dep of stage.order_after) {
        const prereq = stageByName.get(dep.stage)
        expect(prereq, `${stage.name} order_after unknown stage "${dep.stage}"`).toBeTruthy()
        const computed = computeRealized(prereq!.runtime.runs, stage.runtime.runs)
        expect(
          dep.realized,
          `${stage.name} order_after ${dep.stage}: declared realized=${dep.realized} `
          + `but runs ([${prereq!.runtime.runs.join(', ')}] → [${stage.runtime.runs.join(', ')}]) `
          + `compute ${computed}`,
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
    // Regression proof that a `runs` edit is caught. If rebaser moved to 05:00 (an
    // hour before the 06:00 reviewer), the declared realized=false would no longer
    // match the run times and the assertion above would fail.
    expect(computeRealized(['16:15'], ['06:00', '16:00'])).toBe(false)
    expect(computeRealized(['05:00'], ['06:00', '16:00'])).toBe(true)
  })
})

describe('factory manifest — runs respect the one-hour minimum (pipeline policy, ADR-0023)', () => {
  it('no stage runs two tasks less than an hour apart', () => {
    for (const stage of stages) {
      expect(
        minRunInterval(stage.runtime.runs),
        `${stage.name} runs [${stage.runtime.runs.join(', ')}] sub-hourly`,
      ).toBeGreaterThanOrEqual(MIN_RUN_INTERVAL_MINUTES)
    }
  })
})

/** The YAML frontmatter block of an agent file (between the leading `---` fences). */
function agentFrontmatter(path: string): Record<string, unknown> {
  const source = readFileSync(abs(path), 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source)
  if (match === null) {
    throw new Error(`${path} has no frontmatter block`)
  }
  return parse(match[1]!) as Record<string, unknown>
}

describe('factory manifest — agent frontmatter model equals the manifest pin', () => {
  // Full ids only (`claude-opus-5`, not `opus`): an alias floats to whatever the
  // runtime resolves it to, so it cannot be compared against the declared pin. T3 has
  // no per-task model, so `runtime.model` IS the per-item agent pin (ADR-0025).
  const FULL_MODEL_ID = /^claude-[a-z0-9-]+$/

  it('every stage pins a full model id in runtime.model', () => {
    for (const stage of stages) {
      expect(stage.runtime.model, `${stage.name} runtime.model is not a full id`).toMatch(FULL_MODEL_ID)
    }
  })

  it('every agent file declares the same model as its stage', () => {
    for (const stage of stages) {
      const frontmatter = agentFrontmatter(stage.agent)
      expect(frontmatter.model, `${stage.agent} frontmatter model ≠ ${stage.name} runtime.model`).toBe(stage.runtime.model)
    }
  })

  it('is a real guard: an alias in the frontmatter would not match the pinned id', () => {
    expect(FULL_MODEL_ID.test('sonnet')).toBe(false)
    expect(FULL_MODEL_ID.test('')).toBe(false)
    expect(FULL_MODEL_ID.test('claude-sonnet-5')).toBe(true)
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Static contract test over the `production-smoke` job in .github/workflows/ci.yml
// (issue #107, refining ADR-0020). CI-workflow YAML is not otherwise
// unit-testable — the same constraint ADR-0020 records — so this pins the wiring
// that a future edit could silently break: the failure-issue steps must fire only
// on the two real gates (not bare `failure()`), the composer script must exist,
// and the temp-file / report-path / runner-image references must agree with the
// job env and playwright.config.ts. Precedent: tests/factory-contract.test.ts.

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const abs = (rel: string): string => join(repoRoot, rel)

interface Step {
  name?: string
  id?: string
  if?: string
  env?: Record<string, string>
  run?: string
  with?: Record<string, string>
}
interface Job {
  'runs-on'?: string
  'permissions'?: Record<string, string>
  'steps'?: Step[]
}
interface Workflow {
  jobs: Record<string, Job>
}

const workflow = parse(readFileSync(abs('.github/workflows/ci.yml'), 'utf8')) as Workflow
const smokeJob = workflow.jobs['production-smoke']
const steps = smokeJob?.steps ?? []
const stepByName = (name: string): Step | undefined => steps.find(s => s.name === name)

const composeStep = stepByName('Compose failure report')
const fileStep = stepByName('File a failure issue')
const playwrightConfig = readFileSync(abs('playwright.config.ts'), 'utf8')

describe('production-smoke workflow — job exists', () => {
  it('defines the production-smoke job with the failure-issue steps', () => {
    expect(smokeJob, 'production-smoke job missing').toBeTruthy()
    expect(composeStep, 'Compose failure report step missing').toBeTruthy()
    expect(fileStep, 'File a failure issue step missing').toBeTruthy()
  })
})

describe('production-smoke workflow — files only on real gate failures (§test 15)', () => {
  it('gates both failure-issue steps on the poll and smoke outcomes, not bare failure()', () => {
    for (const [label, step] of [['compose', composeStep], ['file', fileStep]] as const) {
      const condition = step?.if ?? ''
      expect(condition, `${label} step references steps.poll.outcome`).toContain('steps.poll.outcome')
      expect(condition, `${label} step references steps.smoke.outcome`).toContain('steps.smoke.outcome')
      // A bare `failure()` (not the `!cancelled()` guard) would re-admit infra flakes.
      expect(/(^|[^!])\bfailure\(\)/.test(condition), `${label} step must not use bare failure()`).toBe(false)
    }
  })
})

describe('production-smoke workflow — wiring is consistent (§test 16)', () => {
  it('runs the extracted composer module, which exists in the tree', () => {
    expect(composeStep?.run).toContain('scripts/ci/production-smoke-issue.mjs')
    expect(existsSync(abs('scripts/ci/production-smoke-issue.mjs'))).toBe(true)
  })

  it('hands off through the same temp file the filing step reads', () => {
    const output = composeStep?.env?.OUTPUT_FILE
    const report = fileStep?.env?.REPORT_FILE
    expect(output, 'compose OUTPUT_FILE set').toBeTruthy()
    expect(report, 'file REPORT_FILE set').toBeTruthy()
    expect(output).toBe(report)
  })

  it('reads the JSON report path the playwright config writes in remote mode', () => {
    const jsonReport = composeStep?.env?.JSON_REPORT
    expect(jsonReport, 'JSON_REPORT set').toBeTruthy()
    // playwright.config.ts emits the json reporter to this exact path (remote mode).
    expect(playwrightConfig).toContain(`outputFile: '${jsonReport}'`)
  })

  it('passes the runner image that matches the job runs-on', () => {
    expect(composeStep?.env?.RUNNER_IMAGE).toBe(smokeJob['runs-on'])
  })

  it('scopes issues: write to this job only', () => {
    expect(smokeJob.permissions?.issues).toBe('write')
    expect(smokeJob.permissions?.contents).toBe('read')
    // The workflow default must stay read-only; no other job grants issues: write.
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name === 'production-smoke') {
        continue
      }
      expect(job.permissions?.issues, `${name} must not grant issues: write`).not.toBe('write')
    }
  })

  it('composes with the failure mode derived from the poll outcome', () => {
    // poll failed ⇒ 'poll'; otherwise 'smoke' — the branch the body renders on.
    expect(composeStep?.env?.FAILURE_MODE).toContain('steps.poll.outcome')
  })
})

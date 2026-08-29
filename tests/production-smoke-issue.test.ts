import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// The composer is a plain ESM module shared with the CI workflow; import it as-is.
import {
  buildProductionSmokeIssue,
  runCli,
  summarizeFailures,
} from '../scripts/ci/production-smoke-issue.mjs'

// A Playwright JSON report with two real failures (`unexpected`) across nested
// suites and one flaky test, mirroring what `--retries=2` produces.
function reportFixture() {
  return {
    suites: [
      {
        title: 'smoke.spec.ts',
        file: 'smoke.spec.ts',
        specs: [
          {
            title: 'authed shell renders',
            tests: [
              {
                projectName: 'chromium',
                status: 'unexpected',
                results: [
                  { status: 'failed', error: { message: 'Error: expected heading to be visible' } },
                ],
              },
            ],
          },
        ],
        suites: [
          {
            title: 'deep-link walk',
            specs: [
              {
                title: 'survives a hard reload',
                tests: [
                  {
                    projectName: 'mobile-chrome',
                    status: 'unexpected',
                    results: [
                      { status: 'failed', errors: [{ message: 'expect(received).toBe(expected)' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'mobile-pwa.spec.ts',
        specs: [
          {
            title: 'manifest is served',
            tests: [
              {
                projectName: 'chromium',
                status: 'flaky',
                results: [
                  { status: 'failed', error: { message: 'flaked once' } },
                  { status: 'passed' },
                ],
              },
            ],
          },
          {
            title: 'service worker registers',
            tests: [
              { projectName: 'chromium', status: 'expected', results: [{ status: 'passed' }] },
            ],
          },
        ],
      },
    ],
  }
}

const baseInput = {
  sha: 'abc1234def5678abc1234def5678abc1234def56',
  baseUrl: 'https://habits.fmeyer.dev',
  runUrl: 'https://github.com/o/r/actions/runs/412',
  runNumber: '412',
  runAttempt: '1',
  workflow: 'CI/CD',
  jobName: 'production-smoke',
  playwrightVersion: '1.61.0',
  runnerImage: 'ubuntu-24.04-arm',
  runnerOsArch: 'Linux/ARM64',
  nodeVersion: '22',
  projects: ['chromium', 'mobile-chrome'],
  grep: '@production',
  retries: 2,
}

describe('buildProductionSmokeIssue — structure', () => {
  it('emits the marker and all five bug-report headings in order (smoke mode)', () => {
    const { body } = buildProductionSmokeIssue({
      ...baseInput,
      mode: 'smoke',
      failureMarkdown: '#### a › b — `chromium`\n\n```\nboom\n```',
      failureCounts: { failed: 2, flaky: 1, total: 4 },
    })
    expect(body.startsWith('<!-- routine:production-smoke -->')).toBe(true)
    const order = ['## Description', '## Steps to reproduce', '## Expected behavior', '## Actual behavior', '## Environment']
    let cursor = -1
    for (const heading of order) {
      const at = body.indexOf(heading)
      expect(at, `${heading} present`).toBeGreaterThan(-1)
      expect(at, `${heading} in order`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('renders a runnable repro block in smoke mode', () => {
    const { body } = buildProductionSmokeIssue({ ...baseInput, mode: 'smoke', failureCounts: { failed: 1, flaky: 0, total: 1 } })
    expect(body).toContain('E2E_SKIP_WEB_SERVER=1')
    expect(body).toContain('E2E_BASE_URL=https://habits.fmeyer.dev')
    expect(body).toContain('--grep @production')
    expect(body).toContain('--retries=2')
  })

  it('swaps repro + actual for the poll gate', () => {
    const { body } = buildProductionSmokeIssue({
      ...baseInput,
      mode: 'poll',
      liveSha: 'def5678',
      pollAttempts: 18,
      pollWindowSeconds: 90,
    })
    expect(body).toContain('version.json')
    expect(body).toContain('def5678')
    expect(body).toContain('18')
    // No runnable Playwright invocation on the poll path (there is no report).
    expect(body).not.toContain('npx playwright test --grep')
  })

  it('hedges when the poll never saw a commit', () => {
    const { body } = buildProductionSmokeIssue({ ...baseInput, mode: 'poll', liveSha: '' })
    expect(body).toContain('unreachable or served no `commit` field')
    // No empty inline-code span (a blank SHA would render ``) — excludes fences.
    expect(body).not.toMatch(/(?<!`)``(?!`)/)
  })

  it('branches the consequence paragraph per mode', () => {
    const smoke = buildProductionSmokeIssue({ ...baseInput, mode: 'smoke', failureCounts: { failed: 1, flaky: 0, total: 1 } }).body
    const poll = buildProductionSmokeIssue({ ...baseInput, mode: 'poll', liveSha: 'def5678' }).body
    expect(smoke).toContain('is** live')
    expect(poll).toContain('**unknown**')
    expect(smoke).not.toEqual(poll)
  })

  it('is mode-aware in the title', () => {
    const smoke = buildProductionSmokeIssue({ ...baseInput, mode: 'smoke', failureCounts: { failed: 2, flaky: 0, total: 2 } })
    const poll = buildProductionSmokeIssue({ ...baseInput, mode: 'poll', liveSha: 'def5678' })
    expect(smoke.title).toBe('Production smoke failed for abc1234 (2 @production tests failed)')
    expect(poll.title).toBe('Production smoke failed for abc1234 (deploy gate: SHA never went live)')
  })

  it('reports the failure/flaky counts in the summary sentence', () => {
    const { body } = buildProductionSmokeIssue({
      ...baseInput,
      mode: 'smoke',
      failureMarkdown: '#### x — `chromium`\n\n```\ne\n```',
      failureCounts: { failed: 2, flaky: 1, total: 11 },
    })
    expect(body).toContain('2 test(s) failed after retries (1 flaky, excluded)')
  })

  it('substitutes a cause sentence when there is no failure output', () => {
    const { body } = buildProductionSmokeIssue({
      ...baseInput,
      mode: 'smoke',
      failureMarkdown: '',
      failureCounts: { failed: 1, flaky: 0, total: 1 },
      reportError: 'ENOENT',
    })
    expect(body).toContain('Failure output unavailable (`ENOENT`)')
    expect(body).not.toContain('```\n\n```') // no empty fenced block
  })

  it('caps the embedded failure block at 4000 chars on a boundary', () => {
    const oneBlock = (i: number) => `#### spec ${i} — \`chromium\`\n\n\`\`\`\n${'x'.repeat(1200)}\n\`\`\``
    const failureMarkdown = Array.from({ length: 10 }, (_, i) => oneBlock(i)).join('\n\n')
    expect(failureMarkdown.length).toBeGreaterThan(12000 - 1)
    const { body } = buildProductionSmokeIssue({
      ...baseInput,
      mode: 'smoke',
      failureMarkdown,
      failureCounts: { failed: 10, flaky: 0, total: 10 },
    })
    const start = body.indexOf('#### spec 0')
    const truncationMarker = body.indexOf('output truncated')
    expect(start).toBeGreaterThan(-1)
    expect(truncationMarker).toBeGreaterThan(start)
    const embedded = body.slice(start, truncationMarker)
    expect(embedded.length).toBeLessThanOrEqual(4000)
  })

  it('produces a plausible issue body — no leaked placeholders', () => {
    for (const mode of ['smoke', 'poll'] as const) {
      const { body } = buildProductionSmokeIssue({ ...baseInput, mode, liveSha: 'def5678', failureCounts: { failed: 1, flaky: 0, total: 1 } })
      expect(typeof body).toBe('string')
      expect(body.length).toBeLessThan(65536)
      expect(body).not.toContain('undefined')
      expect(body).not.toContain('[object Object]')
    }
  })

  it('never throws on a hostile input and falls back', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const { title, body } = buildProductionSmokeIssue({ mode: 'smoke', sha: 'abc1234', failureCounts: circular as never })
    expect(title).toContain('abc1234')
    expect(body).toContain('<!-- routine:production-smoke -->')
  })
})

describe('summarizeFailures', () => {
  it('walks nested suites, lists only real failures, counts flaky separately', () => {
    const { markdown, counts } = summarizeFailures(reportFixture())
    expect(counts.failed).toBe(2)
    expect(counts.flaky).toBe(1)
    expect(counts.total).toBe(4)
    expect(markdown).toContain('authed shell renders')
    expect(markdown).toContain('deep-link walk › survives a hard reload')
    expect(markdown).toContain('chromium')
    expect(markdown).toContain('mobile-chrome')
    // Flaky and passing tests are not listed as failures.
    expect(markdown).not.toContain('manifest is served')
    expect(markdown).not.toContain('service worker registers')
  })

  it('strips ANSI and caps each error at maxCharsPerError', () => {
    const report = {
      suites: [
        {
          title: 'x.spec.ts',
          specs: [
            {
              title: 'noisy',
              tests: [
                {
                  projectName: 'chromium',
                  status: 'unexpected',
                  results: [{ status: 'failed', error: { message: `[31m${'e'.repeat(5000)}[0m` } }],
                },
              ],
            },
          ],
        },
      ],
    }
    const { markdown } = summarizeFailures(report, { maxCharsPerError: 1000 })
    expect(markdown).not.toContain('[')
    // 1000 chars + the "… (truncated)" marker, plus fences/heading.
    expect(markdown).toContain('… (truncated)')
    expect(markdown.length).toBeLessThan(1300)
  })

  it('caps the number of listed tests and notes the remainder', () => {
    const specs = Array.from({ length: 15 }, (_, i) => ({
      title: `spec ${i}`,
      tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ status: 'failed', error: { message: `boom ${i}` } }] }],
    }))
    const { markdown, counts } = summarizeFailures({ suites: [{ title: 'many.spec.ts', specs }] }, { maxTests: 10 })
    expect(counts.failed).toBe(15)
    expect(markdown).toContain('and 5 more failed test(s)')
  })

  it('returns an empty summary for malformed / missing input, never throwing', () => {
    expect(summarizeFailures(undefined)).toEqual({ markdown: '', counts: { failed: 0, flaky: 0, total: 0 } })
    expect(summarizeFailures(JSON.parse('{}'))).toEqual({ markdown: '', counts: { failed: 0, flaky: 0, total: 0 } })
    expect(summarizeFailures({ suites: 'not-an-array' } as never)).toEqual({ markdown: '', counts: { failed: 0, flaky: 0, total: 0 } })
  })
})

describe('runCli', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'smoke-issue-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('composes from a real report file and writes the handoff JSON', async () => {
    const reportPath = join(dir, 'report.json')
    const outputFile = join(dir, 'issue.json')
    writeFileSync(reportPath, JSON.stringify(reportFixture()))
    const payload = await runCli({
      env: {
        FAILURE_MODE: 'smoke',
        DEPLOYED_SHA: baseInput.sha,
        BASE_URL: baseInput.baseUrl,
        RUN_URL: baseInput.runUrl,
        JSON_REPORT: reportPath,
        OUTPUT_FILE: outputFile,
      },
    })
    expect(payload.title).toContain('2 @production tests failed')
    const written = JSON.parse(readFileSync(outputFile, 'utf8'))
    expect(written.title).toBe(payload.title)
    expect(written.body).toContain('authed shell renders')
  })

  it('never throws and still writes a body when the report is missing or invalid', async () => {
    for (const contents of [null, '{'] as const) {
      const outputFile = join(dir, `issue-${contents === null ? 'missing' : 'invalid'}.json`)
      const reportPath = join(dir, 'r.json')
      if (contents !== null) {
        writeFileSync(reportPath, contents)
      }
      const payload = await runCli({
        env: {
          FAILURE_MODE: 'smoke',
          DEPLOYED_SHA: baseInput.sha,
          BASE_URL: baseInput.baseUrl,
          RUN_URL: baseInput.runUrl,
          JSON_REPORT: reportPath,
          OUTPUT_FILE: outputFile,
        },
      })
      expect(payload.body).toContain('Failure output unavailable')
      const written = JSON.parse(readFileSync(outputFile, 'utf8'))
      expect(written.body).toContain('<!-- routine:production-smoke -->')
    }
  })
})

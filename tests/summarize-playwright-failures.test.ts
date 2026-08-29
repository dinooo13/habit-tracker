import { describe, expect, it } from 'vitest'
import { summarizeFailures } from '../scripts/ci/summarize-playwright-failures.cjs'

const ESC = String.fromCharCode(27)

/** Minimal Playwright-JSON-report shape with one failing spec across projects. */
function reportWith(specs: unknown[]) {
  return { suites: [{ title: 'smoke.spec.ts', specs: [], suites: [{ title: 'App shell smoke', specs }] }] }
}

function failingSpec(title: string, projects: { name: string, error?: string }[]) {
  return {
    title,
    ok: false,
    tests: projects.map(p => ({
      projectName: p.name,
      results: [{ status: 'failed', error: p.error === undefined ? undefined : { message: p.error } }],
    })),
  }
}

describe('summarizeFailures', () => {
  it('lists each failing test with its project, title path, and error', () => {
    const report = reportWith([
      failingSpec('authenticated dashboard renders the habit queue shell', [
        { name: 'chromium', error: 'expect(page).toHaveURL failed\nReceived: "/app/"' },
        { name: 'mobile-chrome', error: 'expect(page).toHaveURL failed\nReceived: "/app/"' },
      ]),
    ])

    const md = summarizeFailures(report)

    expect(md).toContain('**chromium**')
    expect(md).toContain('**mobile-chrome**')
    // Full title path, joined with the › separator.
    expect(md).toContain('smoke.spec.ts › App shell smoke › authenticated dashboard renders the habit queue shell')
    expect(md).toContain('expect(page).toHaveURL failed')
  })

  it('strips ANSI escape codes from error messages', () => {
    const report = reportWith([
      failingSpec('coloured failure', [{ name: 'chromium', error: `${ESC}[31mExpected${ESC}[39m red text` }]),
    ])

    const md = summarizeFailures(report)

    expect(md).toContain('Expected red text')
    expect(md).not.toContain(ESC)
  })

  it('truncates long error messages with an ellipsis', () => {
    const longError = 'x'.repeat(900)
    const report = reportWith([
      failingSpec('long failure', [{ name: 'chromium', error: longError }]),
    ])

    const md = summarizeFailures(report, { maxCharsPerError: 800 })

    expect(md).toContain('…')
    expect(md).toContain('x'.repeat(800))
    expect(md).not.toContain('x'.repeat(801))
  })

  it('caps at maxTests and appends an "…and N more" line', () => {
    const specs = Array.from({ length: 12 }, (_, i) =>
      failingSpec(`failure ${i}`, [{ name: 'chromium', error: `boom ${i}` }]))
    const report = reportWith(specs)

    const md = summarizeFailures(report, { maxTests: 10 })

    expect(md).toContain('…and 2 more')
    expect(md).toContain('failure 0')
    expect(md).toContain('failure 9')
    expect(md).not.toContain('failure 10')
  })

  it('omits the fenced block when a failing test has no error message', () => {
    const report = reportWith([
      failingSpec('no error attached', [{ name: 'chromium' }]),
    ])

    const md = summarizeFailures(report)

    expect(md).toContain('**chromium**')
    expect(md).not.toContain('```')
  })

  it('ignores passing specs (ok !== false)', () => {
    const report = reportWith([
      { title: 'a passing spec', ok: true, tests: [{ projectName: 'chromium', results: [{ status: 'passed' }] }] },
    ])
    expect(summarizeFailures(report)).toBe('')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['malformed suites', { suites: 'nope' }],
    ['a number', 42],
  ])('returns an empty string for %s input without throwing', (_label, input) => {
    expect(summarizeFailures(input)).toBe('')
  })
})

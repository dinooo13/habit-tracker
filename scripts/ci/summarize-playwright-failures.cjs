'use strict'

/**
 * Summarize the failing tests in a Playwright JSON report into Markdown, for
 * embedding in the auto-filed production-smoke failure issue (issue #106 / #87,
 * ADR-0020). The filed issue otherwise names only a workflow run whose artifacts
 * expire in 7 days, so a delayed triage pass has nothing to diagnose from.
 *
 * CommonJS on purpose: `actions/github-script` `require`s it from the checked-out
 * workspace, and a pure function gets real Vitest coverage.
 *
 * Contract: never throws. Returns '' for null/undefined/malformed input or when
 * there are no failures — diagnostics must never turn a filed issue into no
 * filed issue.
 */

// ANSI SGR sequences: ESC (0x1b) then '[', digits/semicolons, 'm'. Built from the
// char code so no control character appears in a regex literal (sidesteps the
// `no-control-regex` lint rule while still stripping Playwright's colored diffs).
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, '')
}

function truncate(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function firstErrorMessage(test) {
  const results = Array.isArray(test && test.results) ? test.results : []
  for (const result of results) {
    const message = result && result.error && result.error.message
    if (typeof message === 'string' && message.trim() !== '') return message
  }
  return ''
}

/**
 * Depth-first walk of the report's suite tree, accumulating the ancestor title
 * path. Failing specs (`ok === false`) contribute one entry per test (project).
 */
function collectFailures(node, titlePath, failures) {
  if (!node || typeof node !== 'object') return

  const suites = Array.isArray(node.suites) ? node.suites : []
  for (const suite of suites) {
    const suiteTitle = typeof suite.title === 'string' ? suite.title : ''
    const nextPath = suiteTitle ? [...titlePath, suiteTitle] : titlePath
    collectFailures(suite, nextPath, failures)
  }

  const specs = Array.isArray(node.specs) ? node.specs : []
  for (const spec of specs) {
    if (!spec || spec.ok !== false) continue
    const specTitle = typeof spec.title === 'string' ? spec.title : ''
    const fullTitle = [...titlePath, specTitle].filter(Boolean).join(' › ')
    const tests = Array.isArray(spec.tests) ? spec.tests : []
    for (const test of tests) {
      const project = (test && typeof test.projectName === 'string' && test.projectName) || 'unknown'
      failures.push({ project, title: fullTitle, error: firstErrorMessage(test) })
    }
  }
}

/**
 * @param {unknown} report Parsed Playwright JSON report (`{ suites: [...] }`).
 * @param {{ maxTests?: number, maxCharsPerError?: number }} [options]
 * @returns {string} Markdown listing the failures, or '' when there is nothing to report.
 */
function summarizeFailures(report, options) {
  try {
    const { maxTests = 10, maxCharsPerError = 800 } = options || {}
    const failures = []
    collectFailures(report, [], failures)
    if (failures.length === 0) return ''

    const shown = failures.slice(0, maxTests)
    const lines = []
    for (const failure of shown) {
      lines.push(`- **${failure.project}** — ${failure.title}`)
      if (failure.error) {
        lines.push('')
        lines.push('```')
        lines.push(truncate(stripAnsi(failure.error).trim(), maxCharsPerError))
        lines.push('```')
      }
    }

    const remaining = failures.length - shown.length
    if (remaining > 0) lines.push(`…and ${remaining} more`)

    return lines.join('\n')
  }
  catch {
    return ''
  }
}

module.exports = { summarizeFailures }

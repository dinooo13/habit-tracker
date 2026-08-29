// Composes the bug-report issue the `production-smoke` job files on failure
// (issue #107, refining ADR-0020). Extracted from the workflow's inline
// `github-script` step so the body logic — which parses a Playwright JSON
// report and renders the repo's `Description → Steps → Expected → Actual →
// Environment` shape — is pure and unit-testable, answering the "CI-workflow
// YAML is not unit-testable" trade-off the issue records. The workflow calls the
// CLI wrapper at the bottom; `github-script` only reads the composed JSON and
// calls `issues.create`.
//
// Two public functions, both pure and both non-throwing:
//   - summarizeFailures(report, opts) → { markdown, counts }
//   - buildProductionSmokeIssue(input) → { title, body }
//
// The module uses only Node built-ins (node:fs in the CLI); nothing is imported
// at parse time so `import`ing it from a test never touches the filesystem.

const ROUTINE_MARKER = '<!-- routine:production-smoke -->'
const BASE_URL_FALLBACK = 'https://habits.fmeyer.dev'
const FAILURE_BLOCK_BOUNDARY = '\n#### '
// eslint-disable-next-line no-control-regex -- ANSI escapes are control chars by definition.
const ANSI_PATTERN = /\[[0-9;]*m/g

/** @typedef {'poll' | 'smoke'} FailureMode */

/** Remove ANSI SGR escape sequences Playwright colours its errors with. */
function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_PATTERN, '')
}

/** Truncate to `max` chars, appending an ellipsis marker when cut. */
function truncate(text, max) {
  const value = String(text ?? '')
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max)}\n… (truncated)`
}

/** First non-empty error message across a test's results. */
function firstErrorMessage(test) {
  const results = Array.isArray(test?.results) ? test.results : []
  for (const result of results) {
    const candidates = [
      result?.error?.message,
      ...(Array.isArray(result?.errors) ? result.errors.map(e => e?.message) : []),
      result?.error?.stack,
    ]
    for (const candidate of candidates) {
      const text = stripAnsi(candidate).trim()
      if (text) {
        return text
      }
    }
  }
  return ''
}

/**
 * Parse a Playwright JSON report into a Markdown failure list and counts.
 * Walks `report.suites` recursively (`suite.suites` + `suite.specs`), collecting
 * specs whose per-project test `status === 'unexpected'` (i.e. failed after
 * retries). Flaky tests (`status === 'flaky'`) are counted but excluded from the
 * list — they did not fail the run. Never throws: malformed or missing input
 * yields an empty summary.
 *
 * @param {unknown} report
 * @param {{ maxTests?: number, maxCharsPerError?: number }} [opts]
 * @returns {{ markdown: string, counts: { failed: number, flaky: number, total: number } }}
 */
export function summarizeFailures(report, opts = {}) {
  const maxTests = opts.maxTests ?? 10
  const maxCharsPerError = opts.maxCharsPerError ?? 1000
  const failures = []
  const counts = { failed: 0, flaky: 0, total: 0 }

  const walk = (suite, ancestry) => {
    if (!suite || typeof suite !== 'object') {
      return
    }
    const title = typeof suite.title === 'string' ? suite.title : ''
    const path = title ? [...ancestry, title] : ancestry
    const specs = Array.isArray(suite.specs) ? suite.specs : []
    for (const spec of specs) {
      const specTitle = typeof spec?.title === 'string' ? spec.title : '(untitled)'
      const specPath = [...path, specTitle]
      const tests = Array.isArray(spec?.tests) ? spec.tests : []
      for (const test of tests) {
        counts.total += 1
        const status = test?.status
        const project = typeof test?.projectName === 'string' && test.projectName
          ? test.projectName
          : 'unknown'
        if (status === 'flaky') {
          counts.flaky += 1
          continue
        }
        if (status !== 'unexpected') {
          continue
        }
        counts.failed += 1
        failures.push({
          title: specPath.filter(Boolean).join(' › '),
          project,
          error: truncate(firstErrorMessage(test), maxCharsPerError),
        })
      }
    }
    const nested = Array.isArray(suite.suites) ? suite.suites : []
    for (const child of nested) {
      walk(child, path)
    }
  }

  try {
    const suites = Array.isArray(report?.suites) ? report.suites : []
    for (const suite of suites) {
      walk(suite, [])
    }
  }
  catch {
    return { markdown: '', counts: { failed: 0, flaky: 0, total: 0 } }
  }

  const shown = failures.slice(0, maxTests)
  const blocks = shown.map((failure) => {
    const heading = `#### ${failure.title} — \`${failure.project}\``
    const body = failure.error
      ? ['```', failure.error, '```'].join('\n')
      : '_No error message captured._'
    return `${heading}\n\n${body}`
  })
  if (failures.length > shown.length) {
    blocks.push(`#### … and ${failures.length - shown.length} more failed test(s)\n\nSee the \`production-smoke-report\` artifact for the rest.`)
  }

  return { markdown: blocks.join('\n\n'), counts }
}

/** Cap a failure-block string at `max` chars, cut on a block boundary. */
function capAtBoundary(markdown, max) {
  if (markdown.length <= max) {
    return markdown
  }
  let cut = markdown.lastIndexOf(FAILURE_BLOCK_BOUNDARY, max)
  if (cut <= 0) {
    cut = max
  }
  return `${markdown.slice(0, cut).trimEnd()}\n\n_… output truncated — see the \`production-smoke-report\` artifact for the rest._`
}

function shortSha(sha) {
  const value = String(sha ?? '').trim()
  return value ? value.slice(0, 7) : 'unknown'
}

/** A run reference like "<url> (run #12, attempt 1)". */
function runReference(input) {
  const parts = []
  if (input.runNumber) {
    parts.push(`run #${input.runNumber}`)
  }
  if (input.runAttempt) {
    parts.push(`attempt ${input.runAttempt}`)
  }
  const suffix = parts.length ? ` (${parts.join(', ')})` : ''
  return `${input.runUrl || '(run URL unavailable)'}${suffix}`
}

function describe(input, mode, baseUrl, failed) {
  const short = shortSha(input.sha)
  if (mode === 'poll') {
    return `The post-deploy \`production-smoke\` check failed for **\`${short}\`**: the deployed SHA never went live within the poll window.`
  }
  const count = failed > 0 ? `${failed} of the` : 'the'
  return `The post-deploy \`production-smoke\` check failed for **\`${short}\`**: ${count} \`@production\` tests failed against ${baseUrl}.`
}

function stepsToReproduce(input, mode, baseUrl) {
  const short = shortSha(input.sha)
  if (mode === 'poll') {
    return [
      '```bash',
      `curl -fsS "${baseUrl}/version.json?ts=$(date +%s)"`,
      `# compare the reported .commit with the deployed SHA ${short}`,
      '```',
    ].join('\n')
  }
  const grep = input.grep || '@production'
  const retries = input.retries ?? 2
  return [
    '```bash',
    `git fetch origin && git checkout ${short}`,
    'npm ci',
    'npx playwright install --with-deps chromium',
    `E2E_SKIP_WEB_SERVER=1 E2E_BASE_URL=${baseUrl} \\`,
    `  npx playwright test --grep ${grep} --retries=${retries}`,
    '```',
  ].join('\n')
}

function expectedBehavior(mode, baseUrl) {
  if (mode === 'poll') {
    return `\`version.json\` at ${baseUrl} reports the deployed SHA within the poll window, confirming the new build is live (ADR-0020).`
  }
  return `\`version.json\` reports the deployed SHA and the \`@production\` subset passes against the live origin (ADR-0020).`
}

function actualBehavior(input, mode) {
  if (mode === 'poll') {
    const attempts = input.pollAttempts || 18
    const window = input.pollWindowSeconds || 90
    const live = String(input.liveSha ?? '').trim()
    const observation = live
      ? `\`version.json\` reported \`${live}\` (a different build) after ${attempts} attempts over ~${window}s.`
      : `\`version.json\` was unreachable or served no \`commit\` field after ${attempts} attempts over ~${window}s.`
    return [observation].join('\n')
  }

  const failed = input.failureCounts?.failed ?? 0
  const flaky = input.failureCounts?.flaky ?? 0
  const flakyNote = flaky > 0 ? ` (${flaky} flaky, excluded)` : ''
  const summaryLine = `${failed} test(s) failed after retries${flakyNote}. Full traces and screenshots are in the \`production-smoke-report\` artifact on the run.`

  const failureMarkdown = String(input.failureMarkdown ?? '').trim()
  const detail = failureMarkdown
    ? capAtBoundary(failureMarkdown, 4000)
    : `Failure output unavailable (\`${input.reportError || 'no report'}\`) — see the \`production-smoke-report\` artifact.`

  return `${summaryLine}\n\n${detail}`
}

function consequence(mode) {
  if (mode === 'poll') {
    return 'The deploy gate never confirmed the new build. Production is serving **either** the previous build **or** a partially-mirrored one — its state is **unknown**. `deploy-production` mirrors over FTPS with no previous-artifact retention, so there is nothing to roll back to; verify the live site manually.'
  }
  return 'The deployed SHA **is** live, so production is running this build and failing these assertions. `deploy-production` mirrors over FTPS with no previous-artifact retention, so there is nothing to roll back to — production stays broken until a human acts.'
}

function environmentTable(input, mode, baseUrl) {
  const deployed = String(input.sha ?? '').trim() || 'unknown'
  const live = String(input.liveSha ?? '').trim()
  const liveCell = mode === 'poll'
    ? (live ? `\`${live}\` (mismatch)` : 'unreachable / no `commit` field')
    // On the smoke path the poll gate already confirmed the deployed SHA is live
    // (that gate is what admits this path), so an unset LIVE_SHA still means "live".
    : (live
        ? `\`${live}\`${live === deployed ? ' (matches)' : ' (mismatch)'}`
        : `\`${deployed}\` (confirmed live by the poll gate)`)
  const projects = Array.isArray(input.projects) && input.projects.length
    ? input.projects.join(', ')
    : 'chromium, mobile-chrome'
  const grep = input.grep || '@production'
  const retries = input.retries ?? 2
  const failureMode = mode === 'poll'
    ? 'version-poll gate (deployed SHA never went live)'
    : 'production smoke Playwright run'
  const rows = [
    ['Deployed SHA', `\`${deployed}\``],
    ['Live SHA (`version.json`)', liveCell],
    ['Base URL', baseUrl],
    ['Failure mode', failureMode],
    ['Playwright', `${input.playwrightVersion || 'unknown'} — projects ${projects}; \`--grep ${grep} --retries=${retries}\``],
    ['Runner', `\`${input.runnerImage || 'unknown'}\` (${input.runnerOsArch || 'unknown'}), Node ${input.nodeVersion || '22'}`],
    ['Workflow', `${input.workflow || 'CI/CD'} › ${input.jobName || 'production-smoke'}, ${runReference(input)}`],
    ['Artifacts', '`production-smoke-report` (HTML report, traces, screenshots)'],
  ]
  return ['| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

/**
 * Compose the full bug-report issue for a production-smoke failure. Pure and
 * non-throwing: on any internal error it returns a minimal fallback body so a
 * red deploy is never silent.
 *
 * @param {Record<string, unknown>} input
 * @returns {{ title: string, body: string }}
 */
export function buildProductionSmokeIssue(input = {}) {
  try {
    const mode = input.mode === 'poll' ? 'poll' : 'smoke'
    const baseUrl = String(input.baseUrl ?? '').trim() || BASE_URL_FALLBACK
    const short = shortSha(input.sha)
    const failed = input.failureCounts?.failed ?? 0

    const title = mode === 'poll'
      ? `Production smoke failed for ${short} (deploy gate: SHA never went live)`
      : `Production smoke failed for ${short} (${failed} @production test${failed === 1 ? '' : 's'} failed)`

    const body = [
      ROUTINE_MARKER,
      '',
      '## Description',
      '',
      describe(input, mode, baseUrl, failed),
      '',
      `**Workflow run:** ${runReference(input)}`,
      '',
      '## Steps to reproduce',
      '',
      stepsToReproduce(input, mode, baseUrl),
      '',
      '## Expected behavior',
      '',
      expectedBehavior(mode, baseUrl),
      '',
      '## Actual behavior',
      '',
      actualBehavior(input, mode),
      '',
      '### Consequence',
      '',
      consequence(mode),
      '',
      '## Environment',
      '',
      environmentTable(input, mode, baseUrl),
      '',
      'Recommended labels (add during triage): `type: bug`, `priority: high`, `area: pwa`.',
      '',
    ].join('\n')

    return { title, body }
  }
  catch (error) {
    const short = shortSha(input?.sha)
    const reason = error instanceof Error ? error.message : String(error)
    return {
      title: `Production smoke failed for ${short}`,
      body: [
        ROUTINE_MARKER,
        '',
        `The post-deploy production smoke check failed for **\`${short}\`**.`,
        '',
        `- **Workflow run:** ${input?.runUrl || '(run URL unavailable)'}`,
        `- **Report composition failed:** \`${reason}\` — see the \`production-smoke-report\` artifact.`,
        '',
        'Recommended labels (add during triage): `type: bug`, `priority: high`, `area: pwa`.',
      ].join('\n'),
    }
  }
}

/** Read a value from an env bag, returning undefined for empty strings. */
function envValue(env, key) {
  const value = env[key]
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined
  }
  return String(value)
}

/**
 * CLI: read the failure context from the environment and a Playwright JSON
 * report, compose the issue, and write `{ title, body }` JSON to `$OUTPUT_FILE`.
 * Also appends the body to `$GITHUB_STEP_SUMMARY`. Never exits non-zero: a
 * formatting bug must not swallow a production-failure alert.
 *
 * @param {{ env?: NodeJS.ProcessEnv, fs?: typeof import('node:fs') }} [deps]
 */
export async function runCli(deps = {}) {
  const env = deps.env ?? process.env
  const fs = deps.fs ?? (await import('node:fs'))
  const outputFile = envValue(env, 'OUTPUT_FILE')

  let payload
  try {
    const mode = env.FAILURE_MODE === 'poll' ? 'poll' : 'smoke'

    let failureMarkdown = ''
    let failureCounts = { failed: 0, flaky: 0, total: 0 }
    let reportError
    const reportPath = envValue(env, 'JSON_REPORT')
    if (mode === 'smoke' && reportPath) {
      try {
        const raw = fs.readFileSync(reportPath, 'utf8')
        const report = JSON.parse(raw)
        const summary = summarizeFailures(report)
        failureMarkdown = summary.markdown
        failureCounts = summary.counts
      }
      catch (error) {
        reportError = error instanceof Error ? error.message : String(error)
      }
    }

    payload = buildProductionSmokeIssue({
      mode,
      sha: envValue(env, 'DEPLOYED_SHA'),
      liveSha: envValue(env, 'LIVE_SHA') ?? '',
      pollAttempts: envValue(env, 'POLL_ATTEMPTS'),
      pollWindowSeconds: envValue(env, 'POLL_WINDOW_SECONDS'),
      baseUrl: envValue(env, 'BASE_URL'),
      runUrl: envValue(env, 'RUN_URL'),
      runNumber: envValue(env, 'RUN_NUMBER'),
      runAttempt: envValue(env, 'RUN_ATTEMPT'),
      workflow: envValue(env, 'WORKFLOW'),
      jobName: envValue(env, 'JOB_NAME'),
      playwrightVersion: envValue(env, 'PLAYWRIGHT_VERSION'),
      runnerImage: envValue(env, 'RUNNER_IMAGE'),
      runnerOsArch: envValue(env, 'RUNNER_OS_ARCH'),
      nodeVersion: envValue(env, 'NODE_VERSION'),
      projects: ['chromium', 'mobile-chrome'],
      grep: '@production',
      retries: 2,
      failureMarkdown,
      failureCounts,
      reportError,
    })
  }
  catch (error) {
    const short = shortSha(envValue(env, 'DEPLOYED_SHA'))
    const reason = error instanceof Error ? error.message : String(error)
    payload = {
      title: `Production smoke failed for ${short}`,
      body: [
        ROUTINE_MARKER,
        '',
        `The post-deploy production smoke check failed for **\`${short}\`** (mode: ${env.FAILURE_MODE || 'unknown'}).`,
        '',
        `- **Workflow run:** ${envValue(env, 'RUN_URL') || '(run URL unavailable)'}`,
        `- **Report composition failed:** \`${reason}\``,
        '',
        'Recommended labels (add during triage): `type: bug`, `priority: high`, `area: pwa`.',
      ].join('\n'),
    }
  }

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, JSON.stringify(payload))
    }
    catch {
      // Best-effort: if we can't write the handoff file the github-script step
      // will surface the read error; do not fail the alert on it.
    }
  }

  const summaryFile = envValue(env, 'GITHUB_STEP_SUMMARY')
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, `${payload.body}\n`)
    }
    catch {
      // Non-fatal.
    }
  }

  return payload
}

// Run the CLI only when invoked directly (`node scripts/ci/production-smoke-issue.mjs`),
// not when imported by the test suite.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch(() => {
    // runCli already swallows its own errors; this guards the dynamic import.
    process.exitCode = 0
  })
}

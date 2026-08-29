// Hand-written type surface for the ESM composer in
// `production-smoke-issue.mjs`. Kept in step with that module's public exports so
// a TypeScript consumer (or a typecheck whose globs reach `scripts/`) sees the
// same shapes the JSDoc documents. See ADR-0020 and issue #107.

export type FailureMode = 'poll' | 'smoke'

export interface FailureCounts {
  failed: number
  flaky: number
  total: number
}

export interface SummarizeOptions {
  maxTests?: number
  maxCharsPerError?: number
}

export interface FailureSummary {
  markdown: string
  counts: FailureCounts
}

export interface ProductionSmokeIssueInput {
  mode?: FailureMode
  sha?: string
  liveSha?: string
  pollAttempts?: string | number
  pollWindowSeconds?: string | number
  baseUrl?: string
  runUrl?: string
  runNumber?: string | number
  runAttempt?: string | number
  workflow?: string
  jobName?: string
  playwrightVersion?: string
  runnerImage?: string
  runnerOsArch?: string
  nodeVersion?: string
  projects?: string[]
  grep?: string
  retries?: number
  failureMarkdown?: string
  failureCounts?: FailureCounts
  reportError?: string
}

export interface ComposedIssue {
  title: string
  body: string
}

export function summarizeFailures(report: unknown, opts?: SummarizeOptions): FailureSummary

export function buildProductionSmokeIssue(input?: ProductionSmokeIssueInput): ComposedIssue

export function runCli(deps?: {
  env?: Record<string, string | undefined>
  fs?: typeof import('node:fs')
}): Promise<ComposedIssue>

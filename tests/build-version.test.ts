import { describe, expect, it } from 'vitest'
import { buildVersionPayload, resolveCommitSha } from '~/utils/observability/build-version'

describe('resolveCommitSha', () => {
  it('prefers explicit COMMIT_SHA over everything else', () => {
    const sha = resolveCommitSha(
      { COMMIT_SHA: 'aaa111', GITHUB_SHA: 'bbb222' },
      () => 'ccc333',
    )
    expect(sha).toBe('aaa111')
  })

  it('falls back to GITHUB_SHA when COMMIT_SHA is absent', () => {
    const sha = resolveCommitSha({ GITHUB_SHA: 'bbb222' }, () => 'ccc333')
    expect(sha).toBe('bbb222')
  })

  it('falls back to the injected git resolver when no env var is set', () => {
    const sha = resolveCommitSha({}, () => 'ccc333')
    expect(sha).toBe('ccc333')
  })

  it("degrades to 'unknown' when nothing resolves", () => {
    expect(resolveCommitSha({}, () => null)).toBe('unknown')
  })

  it("degrades to 'unknown' by default (no git resolver injected)", () => {
    expect(resolveCommitSha({})).toBe('unknown')
  })

  it('ignores blank/whitespace env values and trims the winner', () => {
    expect(resolveCommitSha({ COMMIT_SHA: '   ', GITHUB_SHA: '  def456  ' })).toBe('def456')
  })
})

describe('buildVersionPayload', () => {
  it('returns { commit, builtAt } with an ISO builtAt and the commit passed through', () => {
    const now = new Date('2026-08-28T20:34:25.000Z')
    expect(buildVersionPayload('a1b2c3d', now)).toEqual({
      commit: 'a1b2c3d',
      builtAt: '2026-08-28T20:34:25.000Z',
    })
  })

  it("passes 'unknown' through unchanged", () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(buildVersionPayload('unknown', now).commit).toBe('unknown')
  })
})

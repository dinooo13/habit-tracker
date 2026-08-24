import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SAVE_RETRIES,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  RETRY_JITTER_RATIO,
  STORAGE_QUOTA_WARN_RATIO,
  describeWriteFailure,
  isQuotaExceededError,
  isQuotaLowFromEstimate,
  nextRetryDelay,
} from '~/utils/observability/storage-health'

describe('storage health helpers (SEC-18)', () => {
  describe('isQuotaExceededError', () => {
    it('detects a QuotaExceededError DOMException', () => {
      expect(isQuotaExceededError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    })

    it('detects a legacy DOMException by code 22', () => {
      const legacy = new DOMException('full')
      Object.defineProperty(legacy, 'code', { value: 22, configurable: true })
      expect(isQuotaExceededError(legacy)).toBe(true)
    })

    it('detects an Error whose message mentions quota', () => {
      expect(isQuotaExceededError(new Error('The quota has been exceeded'))).toBe(true)
    })

    it('returns false for unrelated errors and non-errors', () => {
      expect(isQuotaExceededError(new Error('network down'))).toBe(false)
      expect(isQuotaExceededError('nope')).toBe(false)
      expect(isQuotaExceededError(null)).toBe(false)
    })
  })

  describe('isQuotaLowFromEstimate', () => {
    it('is true at or above the warn ratio', () => {
      expect(isQuotaLowFromEstimate({ usage: 95, quota: 100 })).toBe(true)
      expect(isQuotaLowFromEstimate({ usage: STORAGE_QUOTA_WARN_RATIO * 100, quota: 100 })).toBe(true)
    })

    it('is false below the warn ratio', () => {
      expect(isQuotaLowFromEstimate({ usage: 10, quota: 100 })).toBe(false)
    })

    it('is false defensively when figures are missing or zero', () => {
      expect(isQuotaLowFromEstimate(undefined)).toBe(false)
      expect(isQuotaLowFromEstimate({})).toBe(false)
      expect(isQuotaLowFromEstimate({ usage: 0, quota: 100 })).toBe(false)
      expect(isQuotaLowFromEstimate({ usage: 50, quota: 0 })).toBe(false)
    })
  })

  describe('describeWriteFailure', () => {
    it('prefixes quota failures', () => {
      expect(describeWriteFailure(new DOMException('disk full', 'QuotaExceededError'))).toContain('Storage is full')
    })

    it('passes through non-quota error messages', () => {
      expect(describeWriteFailure(new Error('boom'))).toBe('boom')
    })
  })

  describe('nextRetryDelay (#65)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('follows the exponential base schedule when jitter is neutral', () => {
      // Math.random() === 0.5 → jitter factor (0.5*2 - 1) === 0 → exact base.
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      expect(nextRetryDelay(0)).toBe(RETRY_BASE_MS)
      expect(nextRetryDelay(1)).toBe(RETRY_BASE_MS * 2)
      expect(nextRetryDelay(2)).toBe(RETRY_BASE_MS * 4)
    })

    it('caps the base at RETRY_CAP_MS for large attempts', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      expect(nextRetryDelay(MAX_SAVE_RETRIES + 5)).toBe(RETRY_CAP_MS)
    })

    it('stays within the ±jitter bounds and never goes negative', () => {
      for (const attempt of [0, 1, 2, 3, 10]) {
        const base = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS)
        for (let draw = 0; draw <= 1.0001; draw += 0.1) {
          vi.spyOn(Math, 'random').mockReturnValue(Math.min(draw, 1))
          const delay = nextRetryDelay(attempt)
          expect(delay).toBeGreaterThanOrEqual(0)
          expect(delay).toBeGreaterThanOrEqual(Math.floor(base * (1 - RETRY_JITTER_RATIO)))
          expect(delay).toBeLessThanOrEqual(Math.ceil(base * (1 + RETRY_JITTER_RATIO)))
          vi.restoreAllMocks()
        }
      }
    })
  })
})

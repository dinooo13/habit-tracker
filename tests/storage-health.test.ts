import { describe, expect, it } from 'vitest'
import {
  STORAGE_QUOTA_WARN_RATIO,
  describeWriteFailure,
  isQuotaExceededError,
  isQuotaLowFromEstimate,
} from '~/utils/storage-health'

describe('storage health helpers (SEC-18)', () => {
  describe('isQuotaExceededError', () => {
    it('detects a QuotaExceededError DOMException', () => {
      expect(isQuotaExceededError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
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
})

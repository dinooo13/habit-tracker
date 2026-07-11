import { describe, expect, it } from 'vitest'
import {
  orderedWeekdayOptions,
  sortWeekdaysForDisplay,
  WEEKDAY_LABELS,
  weekdayRank,
} from '~/utils/domain/weekdays'

describe('orderedWeekdayOptions', () => {
  it('starts on Monday and runs Mon→Sun for weekStartsOn = 1', () => {
    const labels = orderedWeekdayOptions(1).map(option => option.label)
    expect(labels).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('starts on Sunday and runs Sun→Sat for weekStartsOn = 0', () => {
    const labels = orderedWeekdayOptions(0).map(option => option.label)
    expect(labels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('contains all seven canonical weekday values exactly once for either start', () => {
    for (const weekStartsOn of [0, 1] as const) {
      const values = orderedWeekdayOptions(weekStartsOn).map(option => option.value)
      expect([...values].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
    }
  })

  it('pairs each value with its canonical label', () => {
    for (const option of orderedWeekdayOptions(1)) {
      expect(option.label).toBe(WEEKDAY_LABELS[option.value])
    }
  })

  it('returns a fresh array each call (no shared mutable state)', () => {
    const first = orderedWeekdayOptions(1)
    const second = orderedWeekdayOptions(1)
    expect(first).not.toBe(second)
    first.reverse()
    expect(orderedWeekdayOptions(1).map(option => option.label)[0]).toBe('Mon')
  })
})

describe('sortWeekdaysForDisplay', () => {
  it('orders a subset starting from Monday when weekStartsOn = 1', () => {
    expect(sortWeekdaysForDisplay([0, 3, 1, 6], 1)).toEqual([1, 3, 6, 0])
  })

  it('orders a subset starting from Sunday when weekStartsOn = 0', () => {
    expect(sortWeekdaysForDisplay([1, 0, 6, 3], 0)).toEqual([0, 1, 3, 6])
  })

  it('does not mutate the input array', () => {
    const input = [6, 0, 2]
    const snapshot = [...input]
    sortWeekdaysForDisplay(input, 1)
    expect(input).toEqual(snapshot)
  })

  it('handles an empty selection', () => {
    expect(sortWeekdaysForDisplay([], 1)).toEqual([])
  })
})

describe('weekdayRank', () => {
  it('ranks the configured start day at 0', () => {
    expect(weekdayRank(1, 1)).toBe(0)
    expect(weekdayRank(0, 0)).toBe(0)
  })

  it('wraps modulo 7 relative to the start', () => {
    // Monday start: Sunday is the last day → rank 6.
    expect(weekdayRank(0, 1)).toBe(6)
    // Sunday start: Saturday is the last day → rank 6.
    expect(weekdayRank(6, 0)).toBe(6)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from '~/composables/use-clock'
import { addDays, todayDateKey } from '~/utils/domain/date'

// Midday UTC keeps the derived local date key stable in any CI timezone; from a
// local noon, a 24h advance always crosses exactly one local midnight.
const NOON_JUL_15 = new Date('2026-07-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

// The clock is a module singleton and the Nuxt test project shares one runtime
// env (vitest.config.ts), so every case resets it via stop() before and after.
describe('useClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOON_JUL_15)
    // Baseline: sync the singleton to the frozen day, clear timers/subscriptions.
    useClock().stop()
  })

  afterEach(() => {
    useClock().stop()
    vi.useRealTimers()
  })

  it('start() runs syncNow() first, correcting a key gone stale during bootstrap', () => {
    const clock = useClock()
    const day15 = todayDateKey()
    expect(clock.todayKey.value).toBe(day15)

    // Time advances (as it would while bootstrap awaited persistence) without the
    // timer having been armed yet: the ref is now stale.
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    expect(clock.todayKey.value).toBe(day15)

    clock.start()
    expect(clock.todayKey.value).toBe(todayDateKey())
    expect(clock.todayKey.value).toBe(addDays(day15, 1))
  })

  it('the midnight timer advances the key and fires onRollover once', () => {
    const clock = useClock()
    const day15 = todayDateKey()
    const spy = vi.fn()
    clock.onRollover(spy)
    clock.start()

    vi.advanceTimersByTime(DAY_MS)

    expect(clock.todayKey.value).toBe(addDays(day15, 1))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(addDays(day15, 1))
  })

  it('a visibilitychange re-check catches a rollover the throttled timer missed', () => {
    const clock = useClock()
    const day15 = todayDateKey()
    const spy = vi.fn()
    clock.onRollover(spy)
    clock.start()

    // Jump the wall clock across midnight WITHOUT running the (throttled) timer.
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    expect(clock.todayKey.value).toBe(day15)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(clock.todayKey.value).toBe(addDays(day15, 1))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a multi-day gap jumps straight to the current key with a single rollover fire', () => {
    const clock = useClock()
    const day15 = todayDateKey()
    const spy = vi.fn()
    clock.onRollover(spy)
    clock.start()

    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'))
    clock.syncNow()

    expect(clock.todayKey.value).toBe(addDays(day15, 2))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(addDays(day15, 2))
  })

  it('does not fire rollover when the day is unchanged', () => {
    const clock = useClock()
    const spy = vi.fn()
    clock.onRollover(spy)
    clock.start()

    clock.syncNow()
    clock.syncNow()

    expect(spy).not.toHaveBeenCalled()
  })

  it('a throwing subscriber neither aborts the others nor stops the clock', () => {
    const clock = useClock()
    const day15 = todayDateKey()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    clock.onRollover(bad)
    clock.onRollover(good)
    clock.start()

    // First midnight: the surviving subscriber still runs...
    vi.advanceTimersByTime(DAY_MS)
    expect(good).toHaveBeenCalledTimes(1)

    // ...and the timer was re-armed (in finally) despite the throwing subscriber.
    vi.advanceTimersByTime(DAY_MS)
    expect(good).toHaveBeenCalledTimes(2)
    expect(clock.todayKey.value).toBe(addDays(day15, 2))
  })

  it('stop() clears the timer, listeners, and subscriptions', () => {
    const clock = useClock()
    const spy = vi.fn()
    clock.onRollover(spy)
    clock.start()

    clock.stop()

    // Timer cleared: advancing well past several midnights fires nothing.
    vi.advanceTimersByTime(3 * DAY_MS)
    // Listeners removed and subscriptions dropped: re-check events do nothing.
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))

    expect(spy).not.toHaveBeenCalled()
  })
})

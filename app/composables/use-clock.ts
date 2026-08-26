import { readonly, ref } from 'vue'
import { todayDateKey } from '~/utils/domain/date'

/**
 * Central reactive day-clock service (issue #70, ADR-0017).
 *
 * A single module-singleton reactive `todayKey` plus an `onRollover` hook so
 * that every long-lived, day-scoped consumer (dashboard, habits list, Insights,
 * Review cutoff, backup nudge, reminder engine) stays fresh when an installed
 * PWA is left open across local midnight — without each one polling the clock
 * itself.
 *
 * Rollover is detected by a `setTimeout` armed to the next local midnight and
 * re-armed on every fire, **plus** a `visibilitychange`→visible and `focus`
 * re-check (the reminder-engine pattern) that also re-arms the timer. Background
 * timers are throttled or suspended, so the visibility/focus re-sync is what
 * actually catches a rollover that happened while the tab was hidden, and it
 * also picks up a system-clock or timezone change opportunistically.
 *
 * SSR is disabled (`ssr: false`), so a plain module-level `ref` singleton is
 * both the simplest primitive and the most testable — there is no hydration
 * concern. Started once from `bootstrap.client.ts`, mirroring
 * `use-reminder-engine.ts`.
 */

type RolloverCallback = (todayKey: string) => void

const todayKey = ref(todayDateKey())
const rolloverCallbacks = new Set<RolloverCallback>()

let timer: ReturnType<typeof setTimeout> | null = null
let started = false
let visibilityHandler: (() => void) | null = null
let focusHandler: (() => void) | null = null

// Milliseconds from now until the *next* local midnight. A small buffer is
// added so the timer fires just *after* the boundary, guaranteeing `syncNow`
// reads the new date key rather than racing a hair before it.
function msUntilNextMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return nextMidnight.getTime() - now.getTime() + 500
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function armTimer(): void {
  if (!import.meta.client) {
    return
  }

  clearTimer()
  timer = setTimeout(handleTimerFire, msUntilNextMidnight())
}

// A failing subscriber must not stop the clock: re-arm the timer in `finally`
// so the next rollover is still scheduled even if a callback throws.
function handleTimerFire(): void {
  try {
    syncNow()
  }
  finally {
    armTimer()
  }
}

/**
 * Recompute the current local date key and, when it has advanced, update the
 * reactive `todayKey` and invoke every registered rollover callback with the
 * new key. A no-op when the day has not changed. Re-arming from the current
 * time (in the timer path) absorbs suspended-tab drift and multi-day gaps — a
 * single `syncNow` jumps straight to the current key.
 */
function syncNow(): void {
  const current = todayDateKey()
  if (current === todayKey.value) {
    return
  }

  todayKey.value = current

  // Snapshot the callbacks so a subscriber that (un)registers during dispatch
  // cannot mutate the set mid-iteration, and isolate throws so one bad
  // subscriber cannot abort the rest.
  for (const callback of [...rolloverCallbacks]) {
    try {
      callback(current)
    }
    catch {
      // Best-effort: a throwing rollover subscriber is swallowed here.
    }
  }
}

/**
 * Register a rollover callback; returns an unregister function. The callback
 * fires with the new day key each time the local date advances.
 */
function onRollover(callback: RolloverCallback): () => void {
  rolloverCallbacks.add(callback)
  return () => {
    rolloverCallbacks.delete(callback)
  }
}

/**
 * Idempotent start. Corrects any staleness accrued while bootstrap awaited
 * persistence (`syncNow` before arming), arms the midnight timer, then adds the
 * visibility/focus re-check listeners that re-sync and re-arm.
 */
function start(): void {
  if (!import.meta.client || started) {
    return
  }

  started = true
  syncNow()
  armTimer()

  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      syncNow()
      armTimer()
    }
  }
  focusHandler = () => {
    syncNow()
    armTimer()
  }

  document.addEventListener('visibilitychange', visibilityHandler)
  window.addEventListener('focus', focusHandler)
}

/**
 * Tear down the timer, listeners, and subscriptions, and reset the singleton to
 * the current day. Used for teardown and to keep the shared Nuxt test runtime
 * (`vitest.config.ts`) isolated between cases.
 */
function stop(): void {
  clearTimer()

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler)
    focusHandler = null
  }

  rolloverCallbacks.clear()
  started = false
  todayKey.value = todayDateKey()
}

export function useClock() {
  return {
    todayKey: readonly(todayKey),
    onRollover,
    syncNow,
    start,
    stop,
  }
}

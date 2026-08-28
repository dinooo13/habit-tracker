import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readonly, ref } from 'vue'
import { createReminderEngine, useReminderEngine } from '~/composables/use-reminder-engine'
import type { ReminderClock, ReminderEngineDeps } from '~/composables/use-reminder-engine'
import { useClock } from '~/composables/use-clock'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useSettingsStore } from '~/stores/settings'
import { DEFAULT_SETTINGS } from '~/types/app-data'
import type { Habit } from '~/types/app-data'

// The factory suite proves the engine is testable through injected deps alone —
// deliberately NO `vi.stubGlobal('Notification')` and NO `vi.useFakeTimers()`.
// The notifier, clock, and `now` are fakes; the Pinia stores are the real
// Nuxt-provided ones so store query logic stays exercised.

const DAY_KEY = '2026-07-15'
const NEXT_DAY_KEY = '2026-07-16'
const REMINDER_TIME = '08:30'
// A Date whose local HH:MM equals REMINDER_TIME regardless of the host timezone
// (built from local components, read back via getHours/getMinutes).
const AT_REMINDER = () => new Date(2026, 6, 15, 8, 30, 0)

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: REMINDER_TIME,
    startDate: '2026-07-10',
    archived: false,
    pauses: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

// Returns the concrete Mock-typed object (no `satisfies Notifier`, which would
// widen it and drop the `.mock` accessors) — it is still structurally a
// `Notifier` when passed to `createReminderEngine`.
function createFakeNotifier(permission: NotificationPermission = 'granted') {
  return {
    permission: vi.fn((): NotificationPermission => permission),
    requestPermission: vi.fn((): Promise<NotificationPermission> => Promise.resolve(permission)),
    notify: vi.fn((_title: string, _body: string): void => {}),
  }
}

// A controllable clock fake exposing only the `ReminderClock` subset the engine
// consumes, plus a `rollTo` helper that models what the real `syncNow` does when
// the day advances: bump `todayKey` and fire every rollover subscriber.
function createFakeClock(initialKey: string) {
  const key = ref(initialKey)
  const callbacks = new Set<(k: string) => void>()
  const clock = {
    todayKey: readonly(key),
    syncNow: vi.fn(),
    onRollover(cb: (k: string) => void) {
      callbacks.add(cb)
      return () => {
        callbacks.delete(cb)
      }
    },
  } satisfies ReminderClock
  function rollTo(next: string) {
    key.value = next
    for (const cb of [...callbacks]) {
      cb(next)
    }
  }
  return { clock, rollTo }
}

describe('createReminderEngine — injected dependencies (no Notification stub, no fake timers)', () => {
  beforeEach(() => {
    // Quiet the shared singletons the Nuxt bootstrap plugin left running so
    // their real timers/listeners cannot interfere with the injected fakes.
    useReminderEngine().stop()
    useClock().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useSettingsStore().$reset()
    useSettingsStore().hydrate({ ...DEFAULT_SETTINGS, notificationsEnabled: true, dailyReviewTime: '23:58' })
  })

  afterEach(() => {
    useReminderEngine().stop()
    useClock().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useSettingsStore().$reset()
  })

  interface EngineOverrides {
    notifier?: ReturnType<typeof createFakeNotifier>
    clock?: ReminderClock
    now?: ReminderEngineDeps['now']
  }

  function makeEngine(overrides: EngineOverrides = {}) {
    const notifier = overrides.notifier ?? createFakeNotifier()
    const { clock, rollTo } = createFakeClock(DAY_KEY)
    const engine = createReminderEngine({
      clock: overrides.clock ?? clock,
      notifier,
      now: overrides.now ?? AT_REMINDER,
      habitsStore: useHabitsStore(),
      entriesStore: useEntriesStore(),
      settingsStore: useSettingsStore(),
    })
    return { engine, notifier, rollTo }
  }

  function habitNotifyCount(notifier: ReturnType<typeof createFakeNotifier>): number {
    return notifier.notify.mock.calls.filter(([title]) => title.startsWith('Habit reminder')).length
  }

  it('fires for a due habit whose reminderTime matches the current minute', () => {
    useHabitsStore().hydrate([buildHabit()])
    const { engine, notifier } = makeEngine()

    engine.tick()

    expect(notifier.notify).toHaveBeenCalledWith('Habit reminder: Morning run', 'Identity cue: I am a runner.')
    expect(habitNotifyCount(notifier)).toBe(1)
  })

  it('deduplicates within the same day and minute', () => {
    useHabitsStore().hydrate([buildHabit()])
    const { engine, notifier } = makeEngine()

    engine.tick()
    engine.tick()

    expect(habitNotifyCount(notifier)).toBe(1)
  })

  it('re-notifies the next day once the clock rollover clears the dedupe set', () => {
    useHabitsStore().hydrate([buildHabit()])
    const { engine, notifier, rollTo } = makeEngine()

    engine.start() // registers onRollover, then ticks once
    expect(habitNotifyCount(notifier)).toBe(1)

    engine.tick()
    expect(habitNotifyCount(notifier)).toBe(1)

    rollTo(NEXT_DAY_KEY)
    engine.tick()
    expect(habitNotifyCount(notifier)).toBe(2)
  })

  it('skips habits whose entry is already done', () => {
    useHabitsStore().hydrate([buildHabit()])
    useEntriesStore().hydrate([
      {
        id: 'entry_1',
        habitId: 'habit_1',
        date: DAY_KEY,
        status: 'done',
        completedAt: '2026-07-15T08:00:00.000Z',
        missReasonCode: null,
        missReasonNote: null,
      },
    ])
    const { engine, notifier } = makeEngine()

    engine.tick()

    expect(habitNotifyCount(notifier)).toBe(0)
  })

  it('does nothing when notifications are disabled', () => {
    useHabitsStore().hydrate([buildHabit()])
    useSettingsStore().hydrate({ ...DEFAULT_SETTINGS, notificationsEnabled: false, dailyReviewTime: '23:58' })
    const { engine, notifier } = makeEngine()

    engine.tick()

    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('does nothing when notifier permission is not granted', () => {
    useHabitsStore().hydrate([buildHabit()])
    const notifier = createFakeNotifier('denied')
    const { engine } = makeEngine({ notifier })

    engine.tick()

    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('fires the daily-review nudge when now matches dailyReviewTime, deduped on repeat', () => {
    useSettingsStore().hydrate({ ...DEFAULT_SETTINGS, notificationsEnabled: true, dailyReviewTime: REMINDER_TIME })
    const { engine, notifier } = makeEngine()

    engine.tick()
    engine.tick()

    const reviewCalls = notifier.notify.mock.calls.filter(([title]) => title === 'Daily review')
    expect(reviewCalls).toHaveLength(1)
    expect(reviewCalls[0]).toEqual(['Daily review', 'Check missed habits and capture why they slipped.'])
  })

  it('start() is idempotent — the initial tick fires exactly once', () => {
    useHabitsStore().hydrate([buildHabit()])
    const { engine, notifier } = makeEngine()

    engine.start()
    engine.start()

    // The second start() short-circuits on the existing interval, so no extra
    // initial tick and no duplicate notification.
    expect(habitNotifyCount(notifier)).toBe(1)
    engine.stop()
  })

  it('currentPermission / requestPermission delegate to the injected notifier', async () => {
    const notifier = createFakeNotifier('granted')
    const { engine } = makeEngine({ notifier })

    expect(engine.currentPermission()).toBe('granted')
    await expect(engine.requestPermission()).resolves.toBe('granted')
    expect(notifier.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('useReminderEngine() returns one shared singleton instance', () => {
    expect(useReminderEngine()).toBe(useReminderEngine())
  })
})

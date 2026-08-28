import { parseTimeString } from '~/utils/domain/date'
import { useClock } from '~/composables/use-clock'

/**
 * Reminder engine (ADR-0008) — a best-effort, client-only polling loop that
 * fires browser `Notification`s for due habits and the daily-review nudge.
 *
 * Structure (issue #71): the engine is a `createReminderEngine(deps)` factory
 * whose state lives entirely in the instance closure, plus an explicit
 * module-singleton `useReminderEngine()` accessor that wires the real
 * dependencies. Injecting the clock, the notifier, and a wall-clock `now`
 * source makes ticks unit-testable without real timers or the global
 * `Notification` — the DI-for-testability shape mirrors `createPersistenceSaver`
 * (ADR-0017). Behaviour is unchanged from the pre-refactor module-global
 * version: notification content, 30s cadence, minute-granular matching, and
 * best-effort dedupe are identical.
 */

/**
 * The notification I/O boundary. `createBrowserNotifier()` is the production
 * implementation wrapping the global `Notification`; tests pass a fake.
 */
export interface Notifier {
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  notify(title: string, body: string): void
}

/**
 * Default notifier over the browser `Notification` API. All the `ssr: false`
 * client guards and permission checks that used to live inline in the engine
 * (`safeNotify`, `currentPermission`, `requestPermission`) live here now.
 */
export function createBrowserNotifier(): Notifier {
  return {
    permission(): NotificationPermission {
      if (!import.meta.client || typeof Notification === 'undefined') {
        return 'denied'
      }

      return Notification.permission
    },
    requestPermission(): Promise<NotificationPermission> {
      if (!import.meta.client || typeof Notification === 'undefined') {
        return Promise.resolve('denied')
      }

      return Notification.requestPermission()
    },
    notify(title: string, body: string): void {
      if (!import.meta.client || typeof Notification === 'undefined') {
        return
      }

      if (Notification.permission !== 'granted') {
        return
      }

      new Notification(title, {
        body,
        icon: '/icon-192.png',
      })
    },
  }
}

/**
 * The minimal subset of the day-clock (ADR-0018) the engine depends on. Keeping
 * it narrow means a test fake only has to supply these three members.
 */
export type ReminderClock = Pick<ReturnType<typeof useClock>, 'syncNow' | 'todayKey' | 'onRollover'>

export interface ReminderEngineDeps {
  clock: ReminderClock
  notifier: Notifier
  /** Wall-clock source for minute matching; defaults to `() => new Date()`. */
  now?: () => Date
  habitsStore: ReturnType<typeof useHabitsStore>
  entriesStore: ReturnType<typeof useEntriesStore>
  settingsStore: ReturnType<typeof useSettingsStore>
}

export interface ReminderEngine {
  start: () => void
  stop: () => void
  tick: () => void
  requestPermission: () => Promise<NotificationPermission>
  currentPermission: () => NotificationPermission
}

function minuteKeyFromDate(date: Date): string {
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${hour}:${minute}`
}

/**
 * Build a reminder engine over the injected dependencies. All mutable state is
 * closure-local (formerly module globals): the interval handle, the
 * `notifiedKeys` dedupe set, and the listener/rollover unregister handles.
 */
export function createReminderEngine(deps: ReminderEngineDeps): ReminderEngine {
  const { clock, notifier, habitsStore, entriesStore, settingsStore } = deps
  const now = deps.now ?? (() => new Date())

  let reminderInterval: ReturnType<typeof setInterval> | null = null
  // Cleared when the day rolls over (instead of growing unbounded — issue #1,
  // SEC-17). Rollover detection is owned by the central day clock (ADR-0018):
  // `start()` registers one `onRollover` that clears the set.
  const notifiedKeys = new Set<string>()
  let unregisterRollover: (() => void) | null = null
  let focusHandler: (() => void) | null = null
  let visibilityHandler: (() => void) | null = null

  function requestPermission(): Promise<NotificationPermission> {
    return notifier.requestPermission()
  }

  function currentPermission(): NotificationPermission {
    return notifier.permission()
  }

  function tick(): void {
    if (!import.meta.client || !settingsStore.notificationsEnabled) {
      return
    }

    if (currentPermission() !== 'granted') {
      return
    }

    // Re-check the day before reading it (the 30s safety net for a suspended
    // tab whose midnight timer was throttled). A detected rollover fires the
    // clock's `onRollover`, which clears `notifiedKeys` for the new day.
    clock.syncNow()
    const dateKey = clock.todayKey.value
    const minute = minuteKeyFromDate(now())

    for (const habit of habitsStore.dueHabitsForDate(dateKey)) {
      const configured = parseTimeString(habit.reminderTime)
      if (!configured) {
        continue
      }

      const target = `${configured.hour.toString().padStart(2, '0')}:${configured.minute
        .toString()
        .padStart(2, '0')}`

      if (target !== minute) {
        continue
      }

      const entry = entriesStore.entryByHabitAndDate(habit.id, dateKey)
      if (entry?.status === 'done') {
        continue
      }

      const notificationKey = `habit:${habit.id}:${dateKey}:${minute}`
      if (notifiedKeys.has(notificationKey)) {
        continue
      }

      notifier.notify(`Habit reminder: ${habit.name}`, `Identity cue: ${habit.identityStatement}`)
      notifiedKeys.add(notificationKey)
    }

    const reviewTime = settingsStore.dailyReviewTime
    if (reviewTime === minute) {
      const key = `review:${dateKey}:${minute}`
      if (!notifiedKeys.has(key)) {
        notifier.notify('Daily review', 'Check missed habits and capture why they slipped.')
        notifiedKeys.add(key)
      }
    }
  }

  function start(): void {
    if (!import.meta.client || reminderInterval) {
      return
    }

    // Exactly one rollover subscription per engine lifetime — the singleton
    // engine has multiple callers, so registering on construction would
    // duplicate. Clearing `notifiedKeys` on rollover bounds it (issue #70).
    unregisterRollover = clock.onRollover(() => {
      notifiedKeys.clear()
    })

    tick()

    reminderInterval = setInterval(() => {
      tick()
    }, 30_000)

    focusHandler = () => tick()
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        tick()
      }
    }
    window.addEventListener('focus', focusHandler)
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function stop(): void {
    if (reminderInterval) {
      clearInterval(reminderInterval)
      reminderInterval = null
    }

    if (unregisterRollover) {
      unregisterRollover()
      unregisterRollover = null
    }

    // Remove the focus/visibility listeners too (a `stop()` that cleared only
    // the interval would leak these — fixed in #70, locked by regression test).
    if (focusHandler) {
      window.removeEventListener('focus', focusHandler)
      focusHandler = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  return {
    start,
    stop,
    tick,
    requestPermission,
    currentPermission,
  }
}

let instance: ReminderEngine | null = null

/**
 * Explicit module-singleton accessor. Wires the real clock, browser notifier,
 * and Pinia stores once and shares that one engine across all callers
 * (`bootstrap.client.ts` starts it; `settings.vue` reads/requests permission),
 * preserving the pre-refactor shared-state behaviour.
 */
export function useReminderEngine(): ReminderEngine {
  return (instance ??= createReminderEngine({
    clock: useClock(),
    notifier: createBrowserNotifier(),
    habitsStore: useHabitsStore(),
    entriesStore: useEntriesStore(),
    settingsStore: useSettingsStore(),
  }))
}

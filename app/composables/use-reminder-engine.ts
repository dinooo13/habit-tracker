import { parseTimeString } from '~/utils/domain/date'
import { useClock } from '~/composables/use-clock'

let reminderInterval: ReturnType<typeof setInterval> | null = null
const notifiedKeys = new Set<string>()
// The `notifiedKeys` set is cleared when the day rolls over (instead of growing
// unbounded — issue #1, SEC-17). Rollover detection is now owned by the central
// day clock (issue #70, ADR-0018): `start()` registers one `onRollover` that
// clears the set and stores its unregister function here.
let unregisterRollover: (() => void) | null = null
let focusHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null

function safeNotify(title: string, body: string): void {
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
}

function nowMinuteKey(): string {
  const date = new Date()
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${hour}:${minute}`
}

export function useReminderEngine() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const settingsStore = useSettingsStore()
  const clock = useClock()

  function requestPermission(): Promise<NotificationPermission> {
    if (!import.meta.client || typeof Notification === 'undefined') {
      return Promise.resolve('denied')
    }

    return Notification.requestPermission()
  }

  function currentPermission(): NotificationPermission {
    if (!import.meta.client || typeof Notification === 'undefined') {
      return 'denied'
    }

    return Notification.permission
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
    const minute = nowMinuteKey()

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

      safeNotify(`Habit reminder: ${habit.name}`, `Identity cue: ${habit.identityStatement}`)
      notifiedKeys.add(notificationKey)
    }

    const reviewTime = settingsStore.dailyReviewTime
    if (reviewTime === minute) {
      const key = `review:${dateKey}:${minute}`
      if (!notifiedKeys.has(key)) {
        safeNotify('Daily review', 'Check missed habits and capture why they slipped.')
        notifiedKeys.add(key)
      }
    }
  }

  function start(): void {
    if (!import.meta.client || reminderInterval) {
      return
    }

    // Exactly one rollover subscription per engine lifetime — the composable is
    // module-global with multiple callers, so registering on construction would
    // duplicate. Clearing `notifiedKeys` on rollover replaces the old inline
    // date-change self-check (issue #70).
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

    // Remove the focus/visibility listeners too (the previous `stop()` cleared
    // only the interval, leaking these — flagged in the #70 plan review).
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

import { parseTimeString, todayDateKey } from '~/utils/date'

let reminderInterval: ReturnType<typeof setInterval> | null = null
const notifiedKeys = new Set<string>()

function safeNotify(title: string, body: string): void {
  if (!import.meta.client || typeof Notification === 'undefined') {
    return
  }

  if (Notification.permission !== 'granted') {
    return
  }

  new Notification(title, {
    body,
    icon: '/favicon.ico'
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

    const dateKey = todayDateKey()
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

    tick()

    reminderInterval = setInterval(() => {
      tick()
    }, 30_000)

    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tick()
      }
    })
  }

  function stop(): void {
    if (!reminderInterval) {
      return
    }

    clearInterval(reminderInterval)
    reminderInterval = null
  }

  return {
    start,
    stop,
    tick,
    requestPermission,
    currentPermission
  }
}

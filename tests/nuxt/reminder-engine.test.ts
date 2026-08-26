import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from '~/composables/use-clock'
import { useReminderEngine } from '~/composables/use-reminder-engine'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useSettingsStore } from '~/stores/settings'
import { DEFAULT_SETTINGS } from '~/types/app-data'
import type { Habit } from '~/types/app-data'

const NOON_JUL_15 = new Date('2026-07-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

// A constructable Notification stub with a settable static `permission`; call
// counts come from the vi.fn mock.
const NotificationMock = vi.fn()
;(NotificationMock as unknown as { permission: NotificationPermission }).permission = 'granted'

// The reminder engine's `notifiedKeys` embed the date, so its "HH:MM" target
// must equal the current wall-clock minute for a notification to fire.
function currentMinuteKey(): string {
  const date = new Date()
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function habitNotificationCount(): number {
  return NotificationMock.mock.calls.filter(([title]) => String(title).startsWith('Habit reminder')).length
}

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: currentMinuteKey(),
    startDate: '2026-07-10',
    archived: false,
    pauses: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('useReminderEngine — clock-driven rollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOON_JUL_15)
    vi.stubGlobal('Notification', NotificationMock)
    ;(NotificationMock as unknown as { permission: NotificationPermission }).permission = 'granted'
    NotificationMock.mockClear()

    // Reset the shared singletons the Nuxt env's bootstrap plugin left running.
    useClock().stop()
    useReminderEngine().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useSettingsStore().$reset()
    // Notifications on; a review time that never matches the frozen minute so it
    // cannot inject an extra notification.
    useSettingsStore().hydrate({ ...DEFAULT_SETTINGS, notificationsEnabled: true, dailyReviewTime: '23:58' })
  })

  afterEach(() => {
    useReminderEngine().stop()
    useClock().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useSettingsStore().$reset()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('clears notifiedKeys on clock rollover so the next day re-notifies', () => {
    useHabitsStore().hydrate([buildHabit()])
    const engine = useReminderEngine()

    engine.start()
    expect(habitNotificationCount()).toBe(1)

    // Same day, same minute: deduped by notifiedKeys.
    engine.tick()
    expect(habitNotificationCount()).toBe(1)

    // Next day at the same wall-clock minute: tick() calls clock.syncNow(), whose
    // rollover clears notifiedKeys via the engine's onRollover registration.
    vi.setSystemTime(new Date(NOON_JUL_15.getTime() + DAY_MS))
    engine.tick()
    expect(habitNotificationCount()).toBe(2)
  })

  it('stop() removes the focus/visibility listeners (no leaked ticks after stop)', () => {
    useHabitsStore().hydrate([buildHabit()])
    const engine = useReminderEngine()

    engine.start()
    expect(habitNotificationCount()).toBe(1)

    engine.stop()

    // A new day plus re-check events: if a listener had leaked, tick() would run
    // and notify for the new day. A clean stop() means neither fires.
    vi.setSystemTime(new Date(NOON_JUL_15.getTime() + DAY_MS))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(habitNotificationCount()).toBe(1)
  })
})

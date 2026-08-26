import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import DashboardPage from '~/pages/app/index.vue'
import HabitsPage from '~/pages/app/habits/index.vue'
import InsightsPage from '~/pages/app/insights.vue'
import ReviewPage from '~/pages/app/review.vue'
import { useClock } from '~/composables/use-clock'
import { useBackupNudge } from '~/composables/use-backup-nudge'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useSettingsStore } from '~/stores/settings'
import { DEFAULT_SETTINGS, BACKUP_NUDGE_THRESHOLD_WEEKS } from '~/types/app-data'
import type { CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import { addDays, todayDateKey } from '~/utils/domain/date'

const NOON_JUL_15 = new Date('2026-07-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-07-10',
    archived: false,
    pauses: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry_1',
    habitId: 'habit_1',
    date: todayDateKey(),
    status: 'done',
    completedAt: null,
    missReasonCode: null,
    missReasonNote: null,
    ...overrides,
  }
}

// Pages use Nuxt UI tooltips/toasts, which require the `UApp` provider root.
function mountPage(page: unknown) {
  return mountSuspended({
    components: { UApp, Page: page as never },
    template: '<UApp><Page /></UApp>',
  })
}

// Advance the shared clock singleton to the next local day and let reactivity settle.
async function rollToNextDay(): Promise<void> {
  vi.setSystemTime(new Date(NOON_JUL_15.getTime() + DAY_MS))
  useClock().syncNow()
  await nextTick()
}

describe('Day-clock rollover — migrated consumers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOON_JUL_15)
    // Reset the shared singletons the Nuxt env's bootstrap plugin left running,
    // and re-baseline the clock to the frozen day.
    useClock().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
  })

  afterEach(() => {
    useClock().stop()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
    vi.useRealTimers()
  })

  it('dashboard advances the selected date on rollover when viewing today', async () => {
    useHabitsStore().hydrate([buildHabit()])
    const wrapper = await mountPage(DashboardPage)

    expect(wrapper.text()).toContain('Today\'s habit queue')
    expect(wrapper.text()).not.toContain('Viewing a past day')

    await rollToNextDay()

    // Advanced with the new day: still "today", never a stale past-day header.
    expect(wrapper.text()).toContain('Today\'s habit queue')
    expect(wrapper.text()).not.toContain('Viewing a past day')
  })

  it('dashboard leaves an intentional past-day view untouched on rollover', async () => {
    useHabitsStore().hydrate([buildHabit()])
    const wrapper = await mountPage(DashboardPage)

    await wrapper.find('button[aria-label="Previous day"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Viewing a past day')

    await rollToNextDay()

    // The past-day review is preserved (it did NOT jump to the new today).
    expect(wrapper.text()).toContain('Viewing a past day')
  })

  it('habits list re-evaluates pause state on rollover', async () => {
    const day15 = todayDateKey()
    useHabitsStore().hydrate([buildHabit({ pauses: [{ start: day15, end: day15 }] })])
    const wrapper = await mountPage(HabitsPage)

    expect(wrapper.text()).toContain('Paused')

    await rollToNextDay()

    // The pause ended yesterday: no longer paused, shown as a past pause instead.
    expect(wrapper.text()).not.toContain('Paused')
    expect(wrapper.text()).toContain('1 pause')
  })

  it('insights recomputes today-anchored stats on rollover', async () => {
    const day15 = todayDateKey()
    // Due every day, starting today: one due day (today), completed → 100%.
    useHabitsStore().hydrate([buildHabit({ startDate: day15 })])
    useEntriesStore().hydrate([buildEntry({ date: day15, status: 'done' })])
    const wrapper = await mountPage(InsightsPage)

    expect(wrapper.text()).toContain('100%')

    await rollToNextDay()

    // The new day adds an uncompleted due day inside the window: 1 of 2 → 50%.
    expect(wrapper.text()).toContain('50%')
  })

  it('review shifts the 7-day suggestion cutoff on rollover', async () => {
    const day15 = todayDateKey()
    const boundaryDate = addDays(day15, -6) // exactly on the cutoff at day15
    useHabitsStore().hydrate([buildHabit()])
    useEntriesStore().hydrate([
      buildEntry({ id: 'entry_boundary', date: boundaryDate, status: 'missed', missReasonCode: 'forgot' }),
    ])
    const suggestion: CoachingSuggestion = {
      id: 'sugg_1',
      entryId: 'entry_boundary',
      law: 'obvious',
      direction: 'increase',
      title: 'Make it obvious',
      action: 'ZZZ_UNIQUE_ACTION_TEXT',
      rationale: 'A visible cue lowers activation energy.',
      createdAt: `${boundaryDate}T00:00:00.000Z`,
    }
    useCoachStore().hydrate([suggestion])
    const wrapper = await mountPage(ReviewPage)

    expect(wrapper.text()).toContain('ZZZ_UNIQUE_ACTION_TEXT')

    await rollToNextDay()

    // Cutoff moved forward a day: the boundary suggestion now falls outside it.
    expect(wrapper.text()).not.toContain('ZZZ_UNIQUE_ACTION_TEXT')
  })

  it('backup nudge recomputes its decision on rollover', async () => {
    const day15 = todayDateKey()
    // Anchor chosen so the unexported span crosses the threshold at the boundary:
    // one week short at day15, exactly the threshold at day16.
    const anchor = addDays(day15, -(BACKUP_NUDGE_THRESHOLD_WEEKS * 7 - 1))
    useHabitsStore().hydrate([buildHabit()])
    useSettingsStore().hydrate({
      ...DEFAULT_SETTINGS,
      lastExportedAt: `${anchor}T12:00:00.000Z`,
      backupNudgeSnoozedUntil: null,
    })

    const nudge = useBackupNudge()
    expect(nudge.shouldShow.value).toBe(false)

    await rollToNextDay()

    expect(nudge.shouldShow.value).toBe(true)
  })
})

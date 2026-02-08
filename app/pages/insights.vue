<script setup lang="ts">
import { addDays, compareDateKeys, dateKeyRange, isHabitDueOnDate, todayDateKey } from '~/utils/date'
import { MISS_REASON_LABELS } from '~/utils/atomic-rules'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()

const today = computed(() => todayDateKey())
const activeHabits = computed(() => habitsStore.activeHabits)

const completionWindow = ref<'7d' | '30d'>('7d')
const selectedCompletionDays = computed(() => (completionWindow.value === '7d' ? 7 : 30))
const selectedWindowStart = computed(() => addDays(today.value, -(selectedCompletionDays.value - 1)))

const performanceFilter = ref<'needs' | 'best' | 'all'>('needs')
const showAllHabits = ref(false)
const showAllReasons = ref(false)

function overallCompletionRate(fromDate: string, toDate: string): number {
  let dueCount = 0
  let doneCount = 0

  const dates = dateKeyRange(fromDate, toDate)
  for (const date of dates) {
    for (const habit of activeHabits.value) {
      if (!isHabitDueOnDate(habit, date)) {
        continue
      }

      dueCount += 1
      if (entriesStore.entryByHabitAndDate(habit.id, date)?.status === 'done') {
        doneCount += 1
      }
    }
  }

  return dueCount === 0 ? 0 : Math.round((doneCount / dueCount) * 100)
}

const selectedCompletionRate = computed(() =>
  overallCompletionRate(selectedWindowStart.value, today.value)
)

const previousCompletionRate = computed(() => {
  const previousEnd = addDays(selectedWindowStart.value, -1)
  const previousStart = addDays(previousEnd, -(selectedCompletionDays.value - 1))
  return overallCompletionRate(previousStart, previousEnd)
})

const completionDelta = computed(() => selectedCompletionRate.value - previousCompletionRate.value)
const completionDeltaLabel = computed(() => {
  if (completionDelta.value === 0) {
    return `No change vs previous ${selectedCompletionDays.value} days`
  }

  const prefix = completionDelta.value > 0 ? '+' : ''
  return `${prefix}${completionDelta.value}% vs previous ${selectedCompletionDays.value} days`
})

const completionDeltaColor = computed<'success' | 'warning' | 'neutral'>(() => {
  if (completionDelta.value > 0) {
    return 'success'
  }

  if (completionDelta.value < 0) {
    return 'warning'
  }

  return 'neutral'
})

const habitInsights = computed(() =>
  activeHabits.value
    .map((habit) => ({
      habit,
      streak: entriesStore.streakForHabit(habit.id),
      rate: entriesStore.completionRateForHabit(habit, selectedWindowStart.value, today.value)
    }))
    .sort((left, right) => right.rate - left.rate)
)

const filteredHabitInsights = computed(() => {
  if (performanceFilter.value === 'needs') {
    return habitInsights.value.filter((item) => item.rate < 60)
  }

  if (performanceFilter.value === 'best') {
    return habitInsights.value.filter((item) => item.rate >= 80)
  }

  return habitInsights.value
})

watch(performanceFilter, () => {
  showAllHabits.value = false
})

const visibleHabitInsights = computed(() =>
  showAllHabits.value ? filteredHabitInsights.value : filteredHabitInsights.value.slice(0, 3)
)

const canToggleAllHabits = computed(() => filteredHabitInsights.value.length > 3)
const hiddenHabitCount = computed(() =>
  Math.max(filteredHabitInsights.value.length - visibleHabitInsights.value.length, 0)
)

function completionRateColor(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 80) {
    return 'success'
  }

  if (rate >= 50) {
    return 'warning'
  }

  return 'error'
}

const reasonDistribution = computed(() => {
  const distribution = new Map<string, number>()

  for (const entry of entriesStore.entries) {
    if (entry.status !== 'missed' || !entry.missReasonCode) {
      continue
    }

    if (compareDateKeys(entry.date, selectedWindowStart.value) < 0 || compareDateKeys(entry.date, today.value) > 0) {
      continue
    }

    distribution.set(entry.missReasonCode, (distribution.get(entry.missReasonCode) ?? 0) + 1)
  }

  const total = [...distribution.values()].reduce((sum, count) => sum + count, 0)

  return [...distribution.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([code, count]) => ({
      code,
      label: MISS_REASON_LABELS[code as keyof typeof MISS_REASON_LABELS],
      count,
      percent: total ? Math.round((count / total) * 100) : 0
    }))
})

const visibleReasonDistribution = computed(() =>
  showAllReasons.value ? reasonDistribution.value : reasonDistribution.value.slice(0, 3)
)

const canToggleAllReasons = computed(() => reasonDistribution.value.length > 3)

const inferredCoachUptake = computed(() => {
  const suggestionsWithEntries = coachStore.suggestions
    .map((suggestion) => ({
      suggestion,
      entry: entriesStore.entries.find((candidate) => candidate.id === suggestion.entryId)
    }))
    .filter((item): item is { suggestion: typeof coachStore.suggestions[number]; entry: typeof entriesStore.entries[number] } => {
      if (!item.entry) {
        return false
      }

      return (
        compareDateKeys(item.entry.date, selectedWindowStart.value) >= 0
        && compareDateKeys(item.entry.date, today.value) <= 0
      )
    })

  if (!suggestionsWithEntries.length) {
    return 0
  }

  let observableCount = 0
  let improvedCount = 0

  for (const item of suggestionsWithEntries) {
    const observationStart = addDays(item.entry.date, 1)
    const proposedEnd = addDays(item.entry.date, selectedCompletionDays.value)
    const observationEnd = compareDateKeys(proposedEnd, today.value) > 0 ? today.value : proposedEnd

    if (compareDateKeys(observationStart, observationEnd) > 0) {
      continue
    }

    observableCount += 1

    const improved = dateKeyRange(observationStart, observationEnd).some(
      (date) => entriesStore.entryByHabitAndDate(item.entry.habitId, date)?.status === 'done'
    )

    if (improved) {
      improvedCount += 1
    }
  }

  if (!observableCount) {
    return 0
  }

  return Math.round((improvedCount / observableCount) * 100)
})
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h1 class="text-2xl font-semibold">Insights</h1>
            <div class="inline-flex items-center gap-1 rounded-md border border-default/60 p-1">
              <UButton
                size="xs"
                :color="completionWindow === '7d' ? 'primary' : 'neutral'"
                :variant="completionWindow === '7d' ? 'solid' : 'ghost'"
                @click="completionWindow = '7d'"
              >
                7 days
              </UButton>
              <UButton
                size="xs"
                :color="completionWindow === '30d' ? 'primary' : 'neutral'"
                :variant="completionWindow === '30d' ? 'solid' : 'ghost'"
                @click="completionWindow = '30d'"
              >
                30 days
              </UButton>
            </div>
          </div>
        </template>

        <div class="grid grid-cols-2 gap-3">
          <UCard variant="outline">
            <p class="text-sm text-muted">Active habits</p>
            <p class="text-2xl font-semibold">{{ activeHabits.length }}</p>
            <p class="text-xs text-muted">Currently tracked</p>
          </UCard>
          <UCard variant="outline">
            <p class="text-sm text-muted">Coaching uptake</p>
            <p class="text-2xl font-semibold">{{ inferredCoachUptake }}%</p>
            <p class="text-xs text-muted">Inferred from follow-up completions</p>
          </UCard>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-trending-up" class="size-5 text-muted" />
              <h2 class="text-lg font-semibold">Completion trend</h2>
            </div>
          </template>

          <div class="space-y-2 p-1">
            <div class="flex items-end justify-between gap-3">
              <p class="text-sm text-muted">Completion in the last {{ selectedCompletionDays }} days</p>
              <p class="text-3xl font-semibold">{{ selectedCompletionRate }}%</p>
            </div>
            <UProgress :model-value="selectedCompletionRate" />
            <UBadge :color="completionDeltaColor" variant="subtle">
              {{ completionDeltaLabel }}
            </UBadge>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-checks" class="size-5 text-muted" />
              <h2 class="text-lg font-semibold">Habit performance</h2>
            </div>
          </template>

          <div class="space-y-3 p-1">
            <UEmpty
              v-if="!habitInsights.length"
              icon="i-lucide-line-chart"
              title="No habit performance yet"
              description="Create habits and log completions to see trends."
            />

            <template v-else>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  size="xs"
                  :color="performanceFilter === 'needs' ? 'warning' : 'neutral'"
                  :variant="performanceFilter === 'needs' ? 'soft' : 'ghost'"
                  @click="performanceFilter = 'needs'"
                >
                  Needs attention
                </UButton>
                <UButton
                  size="xs"
                  :color="performanceFilter === 'best' ? 'success' : 'neutral'"
                  :variant="performanceFilter === 'best' ? 'soft' : 'ghost'"
                  @click="performanceFilter = 'best'"
                >
                  Best performers
                </UButton>
                <UButton
                  size="xs"
                  :color="performanceFilter === 'all' ? 'primary' : 'neutral'"
                  :variant="performanceFilter === 'all' ? 'soft' : 'ghost'"
                  @click="performanceFilter = 'all'"
                >
                  All
                </UButton>
              </div>

              <UAlert
                v-if="!filteredHabitInsights.length"
                color="neutral"
                variant="subtle"
                title="No habits in this segment"
                description="Switch filters to explore other performance groups."
              />

              <div v-else class="space-y-2">
                <div
                  v-for="item in visibleHabitInsights"
                  :key="item.habit.id"
                  class="rounded-lg border border-default/60 p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <p
                      class="min-w-0 overflow-hidden pr-1 font-medium leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                    >
                      {{ item.habit.name }}
                    </p>
                    <UBadge :color="completionRateColor(item.rate)" variant="subtle" class="shrink-0">
                      {{ item.rate }}%
                    </UBadge>
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{{ selectedCompletionDays }}-day completion</span>
                    <UBadge color="neutral" variant="outline">Streak: {{ item.streak }}</UBadge>
                  </div>
                </div>
              </div>

              <UButton
                v-if="canToggleAllHabits"
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="showAllHabits ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                @click="showAllHabits = !showAllHabits"
              >
                {{ showAllHabits ? 'Show top habits' : `Show all habits (+${hiddenHabitCount})` }}
              </UButton>
            </template>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-pie-chart" class="size-5 text-muted" />
              <h2 class="text-lg font-semibold">Miss reasons</h2>
            </div>
          </template>

          <div class="space-y-3 p-1">
            <UEmpty
              v-if="!reasonDistribution.length"
              icon="i-lucide-pie-chart"
              title="No miss reasons captured"
              :description="`No missed reasons in the last ${selectedCompletionDays} days.`"
            />

            <div v-else class="space-y-2">
              <div
                v-for="item in visibleReasonDistribution"
                :key="item.code"
                class="rounded-lg border border-default/60 p-3"
              >
                <div class="flex items-center justify-between gap-3 text-sm">
                  <p class="font-medium">{{ item.label }}</p>
                  <p class="text-muted">{{ item.percent }}%</p>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ item.count }} miss{{ item.count === 1 ? '' : 'es' }}
                </p>
                <UProgress v-if="showAllReasons" class="mt-2" :model-value="item.percent" color="warning" />
              </div>

              <UButton
                v-if="canToggleAllReasons"
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="showAllReasons ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                @click="showAllReasons = !showAllReasons"
              >
                {{ showAllReasons ? 'Show top reasons' : 'Show all reasons' }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </UPage>
</template>

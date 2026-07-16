<script setup lang="ts">
import { addDays, compareDateKeys, dateKeyRange, formatDateKeyForLocale, todayDateKey } from '~/utils/domain/date'
import { MISS_REASON_LABELS } from '~/utils/domain/atomic-rules'
import * as stats from '~/utils/domain/stats'

definePageMeta({ layout: 'app' })

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()
const requestHeaders = useRequestHeaders(['accept-language'])

const today = computed(() => todayDateKey())
const activeHabits = computed(() => habitsStore.activeHabits)

const completionWindow = ref<'7d' | '30d' | 'all'>('7d')
const selectedCompletionDays = computed<number | null>(() => {
  if (completionWindow.value === 'all') {
    return null
  }

  return completionWindow.value === '7d' ? 7 : 30
})
const earliestTrackedDate = computed(() => {
  let earliest = today.value

  for (const habit of habitsStore.habits) {
    if (compareDateKeys(habit.startDate, earliest) < 0) {
      earliest = habit.startDate
    }
  }

  for (const entry of entriesStore.entries) {
    if (compareDateKeys(entry.date, earliest) < 0) {
      earliest = entry.date
    }
  }

  return earliest
})
const selectedWindowStart = computed(() => {
  if (completionWindow.value === 'all') {
    return earliestTrackedDate.value
  }

  return addDays(today.value, -(selectedCompletionDays.value! - 1))
})
const selectedWindowLabel = computed(() => {
  if (completionWindow.value === 'all') {
    return 'all time'
  }

  return `last ${selectedCompletionDays.value} days`
})
const dateLocale = computed(() => {
  if (import.meta.client) {
    return navigator.languages?.[0] || navigator.language || 'en-US'
  }

  return requestHeaders['accept-language']?.split(',')[0] || 'en-US'
})

const performanceFilter = ref<'needs' | 'best' | 'all'>('needs')
const showAllHabits = ref(false)
const showAllReasons = ref(false)

function overallCompletionRate(fromDate: string, toDate: string): number {
  return stats.overallCompletionRate(activeHabits.value, entriesStore.entries, fromDate, toDate)
}

function dailyCompletionRate(date: string): number {
  return stats.dailyCompletionRate(activeHabits.value, entriesStore.entries, date)
}

const selectedCompletionRate = computed(() =>
  overallCompletionRate(selectedWindowStart.value, today.value),
)

const previousCompletionRate = computed(() => {
  if (completionWindow.value === 'all') {
    return null
  }

  const previousEnd = addDays(selectedWindowStart.value, -1)
  const previousStart = addDays(previousEnd, -(selectedCompletionDays.value! - 1))
  return overallCompletionRate(previousStart, previousEnd)
})

const completionDelta = computed(() => {
  if (previousCompletionRate.value === null) {
    return null
  }

  return selectedCompletionRate.value - previousCompletionRate.value
})
const completionDeltaLabel = computed(() => {
  if (completionDelta.value === null || selectedCompletionDays.value === null) {
    return null
  }

  if (completionDelta.value === 0) {
    return `No change vs previous ${selectedCompletionDays.value} days`
  }

  const prefix = completionDelta.value > 0 ? '+' : ''
  return `${prefix}${completionDelta.value}% vs previous ${selectedCompletionDays.value} days`
})

const completionDeltaColor = computed<'success' | 'warning' | 'neutral'>(() => {
  if (completionDelta.value === null) {
    return 'neutral'
  }

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
    .map(habit => ({
      habit,
      streak: stats.streakForHabit(entriesStore.entries, habit.id),
      rate: stats.completionRateForHabit(habit, entriesStore.entries, selectedWindowStart.value, today.value),
    }))
    .sort((left, right) =>
      right.rate - left.rate
      || right.streak - left.streak
      || left.habit.name.localeCompare(right.habit.name),
    ),
)

const filteredHabitInsights = computed(() => {
  if (performanceFilter.value === 'needs') {
    return habitInsights.value.filter(item => item.rate < 60)
  }

  if (performanceFilter.value === 'best') {
    return habitInsights.value.filter(item => item.rate >= 80)
  }

  return habitInsights.value
})

watch(performanceFilter, () => {
  showAllHabits.value = false
})

const visibleHabitInsights = computed(() =>
  showAllHabits.value ? filteredHabitInsights.value : filteredHabitInsights.value.slice(0, 3),
)

const canToggleAllHabits = computed(() => filteredHabitInsights.value.length > 3)
const hiddenHabitCount = computed(() =>
  Math.max(filteredHabitInsights.value.length - visibleHabitInsights.value.length, 0),
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

const reasonDistribution = computed(() =>
  stats.reasonDistribution(entriesStore.entries, selectedWindowStart.value, today.value)
    .map(item => ({
      ...item,
      label: MISS_REASON_LABELS[item.code],
    })),
)

const visibleReasonDistribution = computed(() =>
  showAllReasons.value ? reasonDistribution.value : reasonDistribution.value.slice(0, 3),
)

const canToggleAllReasons = computed(() => reasonDistribution.value.length > 3)

const completionTrendSeries = computed(() =>
  dateKeyRange(selectedWindowStart.value, today.value).map(date => ({
    date,
    rate: dailyCompletionRate(date),
  })),
)

const completionChartViewWidth = 100
const completionChartViewHeight = 56
const completionChartPlot = {
  left: 2,
  right: 98,
  top: 4,
  bottom: 52,
} as const

const completionChartPlotWidth = completionChartPlot.right - completionChartPlot.left
const completionChartPlotHeight = completionChartPlot.bottom - completionChartPlot.top
const completionChartMidY = completionChartPlot.top + completionChartPlotHeight / 2

function formatTrendDate(dateKey: string | undefined): string {
  if (!dateKey) {
    return ''
  }

  return formatDateKeyForLocale(dateKey, dateLocale.value, {
    day: 'numeric',
    month: 'short',
  })
}

const completionTrendPoints = computed(() => {
  const series = completionTrendSeries.value
  const denominator = Math.max(series.length - 1, 1)

  return series.map((point, index) => {
    const clampedRate = Math.min(100, Math.max(0, point.rate))
    const x = series.length === 1
      ? (completionChartPlot.left + completionChartPlot.right) / 2
      : completionChartPlot.left + (index / denominator) * completionChartPlotWidth
    const y = completionChartPlot.bottom - (clampedRate / 100) * completionChartPlotHeight

    return {
      ...point,
      x,
      y,
    }
  })
})

const completionTrendLinePoints = computed(() =>
  completionTrendPoints.value.map(point => `${point.x},${point.y}`).join(' '),
)

const completionTrendGuideX = computed(() => {
  const points = completionTrendPoints.value
  if (!points.length) {
    return []
  }

  const values = points
    .filter((_, index) => points.length <= 8 || index === 0 || index === points.length - 1 || index % 5 === 0)
    .map(point => point.x)

  return [...new Set(values)]
})

const completionTrendGuideY = computed(() => [
  completionChartPlot.top,
  completionChartPlot.top + completionChartPlotHeight * 0.25,
  completionChartPlot.top + completionChartPlotHeight * 0.5,
  completionChartPlot.top + completionChartPlotHeight * 0.75,
  completionChartPlot.bottom,
])

function completionChartYPercent(y: number): string {
  return `${(y / completionChartViewHeight) * 100}%`
}

const inferredCoachUptake = computed(() =>
  stats.coachUptake(
    coachStore.suggestions,
    entriesStore.entries,
    selectedWindowStart.value,
    today.value,
    selectedCompletionDays.value,
  ),
)
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h1 class="text-2xl font-semibold">
              Insights
            </h1>
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
              <UButton
                size="xs"
                :color="completionWindow === 'all' ? 'primary' : 'neutral'"
                :variant="completionWindow === 'all' ? 'solid' : 'ghost'"
                @click="completionWindow = 'all'"
              >
                All time
              </UButton>
            </div>
          </div>
        </template>

        <div class="grid grid-cols-2 gap-3">
          <UCard variant="outline">
            <p class="text-sm text-muted">
              Active habits
            </p>
            <p class="text-2xl font-semibold">
              {{ activeHabits.length }}
            </p>
            <p class="text-xs text-muted">
              Currently tracked
            </p>
          </UCard>
          <UCard variant="outline">
            <p class="text-sm text-muted">
              Coaching uptake
            </p>
            <p class="text-2xl font-semibold">
              {{ inferredCoachUptake }}%
            </p>
            <p class="text-xs text-muted">
              Inferred from follow-up completions
            </p>
          </UCard>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-trending-up"
                class="size-5 text-muted"
              />
              <h2 class="text-lg font-semibold">
                Completion trend
              </h2>
            </div>
          </template>

          <div class="flex h-full flex-col gap-3 p-1 lg:min-h-[24rem] lg:gap-0">
            <div class="flex lg:flex-1">
              <div class="flex w-full flex-col rounded-lg border border-default/60 p-3 lg:h-full">
                <div class="mb-2 flex items-center justify-between text-[10px] text-muted sm:text-xs">
                  <span>{{ formatTrendDate(completionTrendSeries[0]?.date) }}</span>
                  <span>{{ formatTrendDate(completionTrendSeries[completionTrendSeries.length - 1]?.date) }}</span>
                </div>
                <div class="relative h-32 overflow-hidden rounded-md bg-elevated/20 px-1 py-1 lg:h-auto lg:min-h-[10rem] lg:flex-1">
                  <svg
                    class="absolute inset-0 h-full w-full text-muted/30"
                    :viewBox="`0 0 ${completionChartViewWidth} ${completionChartViewHeight}`"
                    preserveAspectRatio="none"
                  >
                    <line
                      v-for="y in completionTrendGuideY"
                      :key="`y-${y}`"
                      x1="0"
                      :y1="y"
                      :x2="completionChartViewWidth"
                      :y2="y"
                      stroke="currentColor"
                      stroke-width="0.4"
                    />
                    <line
                      v-for="x in completionTrendGuideX"
                      :key="`x-${x}`"
                      :x1="x"
                      :y1="completionChartPlot.top - 2"
                      :x2="x"
                      :y2="completionChartPlot.bottom + 2"
                      stroke="currentColor"
                      stroke-width="0.4"
                    />
                  </svg>
                  <svg
                    class="absolute inset-0 h-full w-full text-primary"
                    :viewBox="`0 0 ${completionChartViewWidth} ${completionChartViewHeight}`"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      :points="completionTrendLinePoints"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="0.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <circle
                      v-for="point in completionTrendPoints"
                      :key="`point-${point.date}`"
                      :cx="point.x"
                      :cy="point.y"
                      r="0.5"
                      fill="currentColor"
                    >
                      <title>{{ point.date }}: {{ point.rate }}%</title>
                    </circle>
                  </svg>
                  <div class="pointer-events-none absolute inset-0 right-1 text-[10px] text-muted/70">
                    <span
                      class="absolute right-0 -translate-y-1/2"
                      :style="{ top: completionChartYPercent(completionChartPlot.top) }"
                    >100%</span>
                    <span
                      class="absolute right-0 -translate-y-1/2"
                      :style="{ top: completionChartYPercent(completionChartMidY) }"
                    >50%</span>
                    <span
                      class="absolute right-0 -translate-y-1/2"
                      :style="{ top: completionChartYPercent(completionChartPlot.bottom) }"
                    >0%</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-auto space-y-2">
              <UProgress :model-value="selectedCompletionRate" />
              <div class="flex items-end justify-between gap-3">
                <p class="text-sm text-muted">
                  Completion for {{ selectedWindowLabel }}
                </p>
                <p class="text-3xl font-semibold">
                  {{ selectedCompletionRate }}%
                </p>
              </div>
              <UBadge
                v-if="completionDeltaLabel"
                :color="completionDeltaColor"
                variant="subtle"
              >
                {{ completionDeltaLabel }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-list-checks"
                class="size-5 text-muted"
              />
              <h2 class="text-lg font-semibold">
                Habit performance
              </h2>
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

              <div
                v-else
                class="space-y-2"
              >
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
                    <UBadge
                      :color="completionRateColor(item.rate)"
                      variant="subtle"
                      class="shrink-0"
                    >
                      {{ item.rate }}%
                    </UBadge>
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{{ completionWindow === 'all' ? 'All-time completion' : `${selectedCompletionDays}-day completion` }}</span>
                    <UBadge
                      color="neutral"
                      variant="outline"
                    >
                      Streak: {{ item.streak }}
                    </UBadge>
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
              <UIcon
                name="i-lucide-pie-chart"
                class="size-5 text-muted"
              />
              <h2 class="text-lg font-semibold">
                Miss reasons
              </h2>
            </div>
          </template>

          <div class="space-y-3 p-1">
            <UEmpty
              v-if="!reasonDistribution.length"
              icon="i-lucide-pie-chart"
              title="No miss reasons captured"
              :description="
                completionWindow === 'all'
                  ? 'No missed reasons captured yet.'
                  : `No missed reasons in the last ${selectedCompletionDays} days.`
              "
            />

            <div
              v-else
              class="space-y-2"
            >
              <div
                v-for="item in visibleReasonDistribution"
                :key="item.code"
                class="rounded-lg border border-default/60 p-3"
              >
                <div class="flex items-center justify-between gap-3 text-sm">
                  <p class="font-medium">
                    {{ item.label }}
                  </p>
                  <p class="text-muted">
                    {{ item.percent }}%
                  </p>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ item.count }} miss{{ item.count === 1 ? '' : 'es' }}
                </p>
                <UProgress
                  v-if="showAllReasons"
                  class="mt-2"
                  :model-value="item.percent"
                  color="warning"
                />
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

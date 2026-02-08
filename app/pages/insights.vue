<script setup lang="ts">
import { addDays, dateKeyRange, todayDateKey, isHabitDueOnDate } from '~/utils/date'
import { MISS_REASON_LABELS } from '~/utils/atomic-rules'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()

const today = computed(() => todayDateKey())
const last7Start = computed(() => addDays(today.value, -6))
const last30Start = computed(() => addDays(today.value, -29))

const activeHabits = computed(() => habitsStore.activeHabits)

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

const last7Rate = computed(() => overallCompletionRate(last7Start.value, today.value))
const last30Rate = computed(() => overallCompletionRate(last30Start.value, today.value))

const reasonDistribution = computed(() => {
  const distribution = entriesStore.reasonDistribution()
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0)

  return Object.entries(distribution)
    .sort((left, right) => right[1] - left[1])
    .map(([code, count]) => ({
      code,
      label: MISS_REASON_LABELS[code as keyof typeof MISS_REASON_LABELS],
      count,
      percent: total ? Math.round((count / total) * 100) : 0
    }))
})

const habitInsights = computed(() =>
  activeHabits.value
    .map((habit) => ({
      habit,
      streak: entriesStore.streakForHabit(habit.id),
      rate30: entriesStore.completionRateForHabit(habit, last30Start.value, today.value)
    }))
    .sort((left, right) => right.rate30 - left.rate30)
)

const inferredCoachUptake = computed(() => {
  if (!coachStore.suggestions.length) {
    return 0
  }

  let improvedCount = 0

  for (const suggestion of coachStore.suggestions) {
    const entry = entriesStore.entries.find((candidate) => candidate.id === suggestion.entryId)
    if (!entry) {
      continue
    }

    const endDate = addDays(entry.date, 7)
    const futureDates = dateKeyRange(addDays(entry.date, 1), endDate)
    const improved = futureDates.some(
      (date) => entriesStore.entryByHabitAndDate(entry.habitId, date)?.status === 'done'
    )

    if (improved) {
      improvedCount += 1
    }
  }

  return Math.round((improvedCount / coachStore.suggestions.length) * 100)
})
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <h1 class="text-2xl font-semibold">Insights</h1>
        </template>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UCard variant="outline">
            <p class="text-sm text-muted">Active habits</p>
            <p class="text-2xl font-semibold">{{ activeHabits.length }}</p>
          </UCard>
          <UCard variant="outline">
            <p class="text-sm text-muted">Pending reflections</p>
            <p class="text-2xl font-semibold">{{ entriesStore.pendingReflectionEntries.length }}</p>
          </UCard>
          <UCard variant="outline">
            <p class="text-sm text-muted">7-day completion</p>
            <p class="text-2xl font-semibold">{{ last7Rate }}%</p>
          </UCard>
          <UCard variant="outline">
            <p class="text-sm text-muted">30-day completion</p>
            <p class="text-2xl font-semibold">{{ last30Rate }}%</p>
          </UCard>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">Completion trend</h2>
            <UBadge color="neutral" variant="outline">Coaching uptake (7-day inferred): {{ inferredCoachUptake }}%</UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <div class="mb-1 flex items-center justify-between text-sm text-muted">
              <span>Last 7 days</span>
              <span>{{ last7Rate }}%</span>
            </div>
            <UProgress :model-value="last7Rate" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm text-muted">
              <span>Last 30 days</span>
              <span>{{ last30Rate }}%</span>
            </div>
            <UProgress :model-value="last30Rate" />
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Habit performance</h2>
          </template>

          <UEmpty
            v-if="!habitInsights.length"
            icon="i-lucide-line-chart"
            title="No habit performance yet"
            description="Create habits and log completions to see trends."
          />

          <div v-else class="space-y-3">
            <UCard v-for="item in habitInsights" :key="item.habit.id" variant="outline">
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="font-medium">{{ item.habit.name }}</p>
                  <UBadge color="neutral" variant="outline">Streak: {{ item.streak }}</UBadge>
                </div>
                <div class="flex items-center justify-between text-sm text-muted">
                  <span>30-day completion</span>
                  <span>{{ item.rate30 }}%</span>
                </div>
                <UProgress :model-value="item.rate30" />
              </div>
            </UCard>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Miss reason distribution</h2>
          </template>

          <UEmpty
            v-if="!reasonDistribution.length"
            icon="i-lucide-pie-chart"
            title="No miss reasons captured"
            description="Reflections will appear here after missed habits are reviewed."
          />

          <div v-else class="space-y-3">
            <div v-for="item in reasonDistribution" :key="item.code" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span>{{ item.label }}</span>
                <span class="text-muted">{{ item.count }} ({{ item.percent }}%)</span>
              </div>
              <UProgress :model-value="item.percent" color="warning" />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </UPage>
</template>

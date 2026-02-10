<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { TabsItem } from '@nuxt/ui'
import { formatDateKeyForLocale, formatTimeString, todayDateKey } from '~/utils/date'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()

const dateKey = computed(() => todayDateKey())
const requestHeaders = useRequestHeaders(['accept-language'])
const dateLocale = computed(() => {
  if (import.meta.client) {
    return navigator.languages?.[0] || navigator.language || 'en-US'
  }

  return requestHeaders['accept-language']?.split(',')[0] || 'en-US'
})
const displayDate = computed(() =>
  formatDateKeyForLocale(dateKey.value, dateLocale.value, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
)

const dueHabits = computed(() => habitsStore.dueHabitsForDate(dateKey.value))

const dueHabitModels = computed(() =>
  dueHabits.value.map((habit) => ({
    habit,
    entry: entriesStore.entryByHabitAndDate(habit.id, dateKey.value)
  }))
)

const doneCount = computed(
  () => dueHabitModels.value.filter((model) => model.entry?.status === 'done').length
)

const skippedCount = computed(
  () => dueHabitModels.value.filter((model) => model.entry?.status === 'skipped').length
)

const missedCount = computed(
  () => dueHabitModels.value.filter((model) => model.entry?.status === 'missed').length
)

const reviewedCount = computed(() => doneCount.value + skippedCount.value + missedCount.value)

const queueProgressValue = computed(() => {
  if (!dueHabitModels.value.length) {
    return 0
  }

  return Math.round((reviewedCount.value / dueHabitModels.value.length) * 100)
})

const pendingReflections = computed(() => entriesStore.pendingReflectionEntries)
const activeHabitStreaks = computed(() =>
  habitsStore.habits
    .filter((habit) => !habit.archived)
    .map((habit) => ({
      id: habit.id,
      name: habit.name,
      type: habit.type,
      streak: entriesStore.streakForHabit(habit.id)
    }))
    .sort((left, right) => right.streak - left.streak || left.name.localeCompare(right.name))
)
const activeStreakCount = computed(() => activeHabitStreaks.value.filter((item) => item.streak > 0).length)
const activeStreakCountLabel = computed(() =>
  activeStreakCount.value > 99 ? '99+' : String(activeStreakCount.value)
)

const tabItems: TabsItem[] = [
  { label: 'Open', icon: 'i-lucide-clock-3', slot: 'open', value: 'open' },
  { label: 'Reviewed', icon: 'i-lucide-list-checks', slot: 'all', value: 'all' }
]

const tabsUi = {
  list: 'grid w-full grid-cols-2',
  trigger: 'min-w-0 justify-center py-1 text-sm leading-none !font-medium data-[state=active]:!font-medium',
  label: 'truncate whitespace-nowrap'
}
const rightBadgeClass = 'w-[50px] justify-center text-center whitespace-nowrap tabular-nums text-xs'
const actionRowClass = 'flex flex-wrap items-center gap-2'
const statusActionBadgeClass = 'inline-flex h-7 min-w-[64px] items-center justify-center rounded-md px-2 text-xs font-medium leading-none'

type QueueStatus = 'open' | 'done' | 'missed' | 'skipped'
type HabitType = 'build' | 'break'
type ReviewedStatus = Exclude<QueueStatus, 'open'>

const habitTypeMeta: Record<HabitType, { label: string, color: 'primary' | 'warning', cardClass: string, dotClass: string, badgeVariant: 'subtle' | 'soft' }> = {
  build: {
    label: 'Build',
    color: 'primary',
    cardClass: 'border-primary',
    dotClass: 'bg-primary',
    badgeVariant: 'soft'
  },
  break: {
    label: 'Break',
    color: 'warning',
    cardClass: 'border-warning',
    dotClass: 'bg-warning',
    badgeVariant: 'soft'
  }
}

const statusMeta: Record<QueueStatus, { label: string, color: 'primary' | 'success' | 'warning' | 'neutral', variant: 'outline' | 'subtle' }> = {
  open: { label: 'Open', color: 'primary', variant: 'outline' },
  done: { label: 'Done', color: 'success', variant: 'subtle' },
  missed: { label: 'Missed', color: 'warning', variant: 'subtle' },
  skipped: { label: 'Skipped', color: 'neutral', variant: 'subtle' }
}
const reviewedStatusOrder: Record<ReviewedStatus, number> = {
  done: 0,
  missed: 1,
  skipped: 2
}

function reminderSortValue(reminderTime: string | null): number {
  if (!reminderTime) {
    return Number.POSITIVE_INFINITY
  }

  const [hourRaw, minuteRaw] = reminderTime.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return Number.POSITIVE_INFINITY
  }

  return hour * 60 + minute
}

function compareByReminderThenName(
  left: (typeof dueHabitModels.value)[number],
  right: (typeof dueHabitModels.value)[number]
): number {
  return (
    reminderSortValue(left.habit.reminderTime) - reminderSortValue(right.habit.reminderTime)
    || left.habit.name.localeCompare(right.habit.name)
  )
}

const openHabits = computed(() =>
  dueHabitModels.value
    .filter((model) => !model.entry)
    .sort(compareByReminderThenName)
)

const reviewedHabits = computed(() =>
  dueHabitModels.value
    .filter((model) => Boolean(model.entry))
    .sort((left, right) => {
      const leftStatus = left.entry?.status
      const rightStatus = right.entry?.status
      const leftStatusRank = leftStatus ? reviewedStatusOrder[leftStatus] : Number.MAX_SAFE_INTEGER
      const rightStatusRank = rightStatus ? reviewedStatusOrder[rightStatus] : Number.MAX_SAFE_INTEGER

      return (
        leftStatusRank - rightStatusRank
        || compareByReminderThenName(left, right)
      )
    })
)

function queueStatus(status: 'done' | 'missed' | 'skipped' | undefined): QueueStatus {
  return status ?? 'open'
}

function typeMeta(type: HabitType): { label: string, color: 'primary' | 'warning', cardClass: string, dotClass: string, badgeVariant: 'subtle' | 'soft' } {
  return habitTypeMeta[type]
}

const toast = useToast()

function setHabitStatus(habitId: string, status: 'done' | 'missed' | 'skipped'): void {
  entriesStore.setStatus(habitId, dateKey.value, status)

  const title =
    status === 'done'
      ? 'Nice work'
      : status === 'missed'
        ? 'Marked as missed'
        : 'Marked as skipped'

  toast.add({ title, color: status === 'done' ? 'success' : 'neutral' })
}

function reminderLabel(reminderTime: string | null): string {
  if (!reminderTime) {
    return 'None'
  }

  const [hourRaw, minuteRaw] = reminderTime.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return reminderTime
  }

  return formatTimeString(hour, minute)
}

function reopenHabit(habitId: string): void {
  const removedEntry = entriesStore.clearStatus(habitId, dateKey.value)
  if (!removedEntry) {
    return
  }

  coachStore.removeForEntry(removedEntry.id)
  toast.add({ title: 'Moved back to open', color: 'neutral' })
}
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm text-muted">Today</p>
              <h1 class="text-2xl font-semibold">{{ displayDate }}</h1>
            </div>
            <div class="flex items-center gap-2">
              <BrandLogo
                class="size-16 shrink-0"
                :center-text="activeStreakCountLabel"
                :aria-label="`Active streaks: ${activeStreakCountLabel}`"
              />
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <div v-if="activeHabitStreaks.length" class="space-y-2">
            <div class="flex items-center justify-between text-xs text-muted">
              <p class="font-medium uppercase tracking-wide">Active streaks</p>
              <p>{{ activeHabitStreaks.length }} habits</p>
            </div>

            <div class="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div
                v-for="item in activeHabitStreaks"
                :key="item.id"
                class="w-36 shrink-0 rounded-md border border-default/80 bg-elevated/60 px-2 py-1.5"
              >
                <div class="flex items-baseline gap-2">
                  <span class="-translate-y-[1px] size-1.5 shrink-0 rounded-full" :class="typeMeta(item.type).dotClass" aria-hidden="true" />
                  <p
                    class="min-w-0 text-xs font-medium leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                  >
                    {{ item.name }}
                  </p>
                </div>
                <div class="mt-1 flex items-center gap-1 text-xs text-muted">
                  <UIcon name="i-lucide-flame" class="size-3.5" />
                  <span>{{ item.streak }}d streak</span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between text-sm text-muted">
            <span>{{ reviewedCount }} of {{ dueHabitModels.length }} reviewed</span>
            <span>{{ queueProgressValue }}%</span>
          </div>
          <UProgress :model-value="queueProgressValue" />

          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="success" variant="subtle">
              Done: {{ doneCount }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              Skipped: {{ skippedCount }}
            </UBadge>
            <UBadge color="warning" variant="subtle">
              Missed: {{ missedCount }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="pendingReflections.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-message-square-warning"
        :title="`${pendingReflections.length} missed habits need reflection`"
        description="Open review to capture why it slipped and get Atomic Habits tactics."
        :actions="[{ label: 'Open review', to: '/app/review', color: 'warning', variant: 'soft' }]"
      />

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-list-todo" class="size-5 text-muted" />
            <h2 class="text-lg font-semibold">Today's habit queue</h2>
          </div>
        </template>

        <UEmpty
          v-if="!dueHabitModels.length"
          icon="i-lucide-calendar-check-2"
          title="No habits due today"
          description="Create a habit or adjust schedule weekdays."
          :actions="[{ label: 'Create habit', to: '/app/habits/new', icon: 'i-lucide-plus' }]"
        />

        <UTabs
          v-else
          :items="tabItems"
          default-value="open"
          :ui="tabsUi"
          variant="link"
          color="neutral"
          class="w-full"
        >
          <template #all>
            <div class="mt-4 grid gap-4">
              <UAlert
                v-if="!reviewedHabits.length"
                color="neutral"
                variant="subtle"
                title="No reviewed habits yet"
                description="Mark habits as done, missed, or skipped in Open to track progress."
              />
              <UCard
                v-for="model in reviewedHabits"
                :key="model.habit.id"
                variant="outline"
                :class="typeMeta(model.habit.type).cardClass"
              >
                <div class="space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="size-2 rounded-full" :class="typeMeta(model.habit.type).dotClass" aria-hidden="true" />
                        <h3 class="font-semibold">{{ model.habit.name }}</h3>
                      </div>
                      <p class="text-sm text-muted">{{ model.habit.identityStatement }}</p>
                    </div>
                    <div class="flex shrink-0 flex-col items-end gap-1.5">
                      <UBadge
                        :color="typeMeta(model.habit.type).color"
                        :variant="typeMeta(model.habit.type).badgeVariant"
                        :class="rightBadgeClass"
                      >
                        {{ typeMeta(model.habit.type).label }}
                      </UBadge>
                      <UBadge color="neutral" variant="soft" :class="rightBadgeClass">
                        {{ reminderLabel(model.habit.reminderTime) }}
                      </UBadge>
                    </div>
                  </div>

                  <div v-if="model.entry" :class="actionRowClass">
                    <UBadge
                      :color="statusMeta[queueStatus(model.entry.status)].color"
                      :variant="statusMeta[queueStatus(model.entry.status)].variant"
                      :class="statusActionBadgeClass"
                    >
                      {{ statusMeta[queueStatus(model.entry.status)].label }}
                    </UBadge>
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-rotate-ccw"
                      @click="reopenHabit(model.habit.id)"
                    >
                      Reopen
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <template #open>
            <div class="mt-4 space-y-2">
              <UAlert
                v-if="!openHabits.length"
                color="success"
                variant="subtle"
                title="No open habits"
                description="Everything due today has already been reviewed."
              />
              <UCard
                v-for="model in openHabits"
                :key="model.habit.id"
                variant="outline"
                :class="typeMeta(model.habit.type).cardClass"
              >
                <div class="space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="size-2 rounded-full" :class="typeMeta(model.habit.type).dotClass" aria-hidden="true" />
                        <h3 class="font-semibold">{{ model.habit.name }}</h3>
                      </div>
                      <p class="text-sm text-muted">{{ model.habit.identityStatement }}</p>
                    </div>
                    <div class="flex shrink-0 flex-col items-end gap-1.5">
                      <UBadge
                        :color="typeMeta(model.habit.type).color"
                        :variant="typeMeta(model.habit.type).badgeVariant"
                        :class="rightBadgeClass"
                      >
                        {{ typeMeta(model.habit.type).label }}
                      </UBadge>
                      <UBadge color="neutral" variant="soft" :class="rightBadgeClass">
                        {{ reminderLabel(model.habit.reminderTime) }}
                      </UBadge>
                    </div>
                  </div>

                  <div :class="actionRowClass">
                    <UTooltip text="Mark completed">
                      <UButton size="sm" color="success" icon="i-lucide-check" @click="setHabitStatus(model.habit.id, 'done')">
                        Done
                      </UButton>
                    </UTooltip>
                    <UTooltip text="Mark missed">
                      <UButton size="sm" color="warning" variant="soft" icon="i-lucide-alert-circle" @click="setHabitStatus(model.habit.id, 'missed')">
                        Missed
                      </UButton>
                    </UTooltip>
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-skip-forward" @click="setHabitStatus(model.habit.id, 'skipped')">
                      Skip
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </UTabs>
      </UCard>
    </div>
  </UPage>
</template>

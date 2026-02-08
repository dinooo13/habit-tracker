<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { todayDateKey } from '~/utils/date'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()

const dateKey = computed(() => todayDateKey())

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

const tabItems: TabsItem[] = [
  { label: 'Open', icon: 'i-lucide-clock-3', slot: 'open', value: 'open' },
  { label: 'All due', icon: 'i-lucide-list-checks', slot: 'all', value: 'all' }
]

const tabsUi = {
  list: 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  trigger: 'shrink-0',
  label: 'overflow-visible text-clip whitespace-nowrap'
}

const openHabits = computed(() => dueHabitModels.value.filter((model) => !model.entry))

type QueueStatus = 'open' | 'done' | 'missed' | 'skipped'
type HabitType = 'build' | 'break'

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
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm text-muted">Today</p>
              <h1 class="text-2xl font-semibold">{{ dateKey }}</h1>
            </div>
            <UButton to="/habits/new" icon="i-lucide-plus">
              Create habit
            </UButton>
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
                <div class="flex items-center gap-2">
                  <span class="size-1.5 rounded-full" :class="typeMeta(item.type).dotClass" aria-hidden="true" />
                  <p class="truncate text-xs font-medium">{{ item.name }}</p>
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
        :actions="[{ label: 'Open review', to: '/review', color: 'warning', variant: 'soft' }]"
      />

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Today's habit queue</h2>
        </template>

        <UEmpty
          v-if="!dueHabitModels.length"
          icon="i-lucide-calendar-check-2"
          title="No habits due today"
          description="Create a habit or adjust schedule weekdays."
          :actions="[{ label: 'Create habit', to: '/habits/new', icon: 'i-lucide-plus' }]"
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
              <UCard
                v-for="model in dueHabitModels"
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
                    <UBadge :color="typeMeta(model.habit.type).color" :variant="typeMeta(model.habit.type).badgeVariant">
                      {{ typeMeta(model.habit.type).label }}
                    </UBadge>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="outline">
                      Reminder: {{ model.habit.reminderTime ?? 'none' }}
                    </UBadge>
                    <UBadge
                      :color="statusMeta[queueStatus(model.entry?.status)].color"
                      :variant="statusMeta[queueStatus(model.entry?.status)].variant"
                    >
                      {{ statusMeta[queueStatus(model.entry?.status)].label }}
                    </UBadge>
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
                        <p class="font-medium">{{ model.habit.name }}</p>
                      </div>
                      <p class="text-sm text-muted">{{ model.habit.identityStatement }}</p>
                    </div>
                    <UBadge :color="typeMeta(model.habit.type).color" :variant="typeMeta(model.habit.type).badgeVariant">
                      {{ typeMeta(model.habit.type).label }}
                    </UBadge>
                  </div>

                  <div class="flex flex-wrap gap-2">
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

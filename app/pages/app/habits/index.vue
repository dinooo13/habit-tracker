<script setup lang="ts">
import type { Habit } from '~/types/app-data'
import { isDateInHabitPause, todayDateKey } from '~/utils/domain/date'
import { sortWeekdaysForDisplay, WEEKDAY_LABELS } from '~/utils/domain/weekdays'

definePageMeta({ layout: 'app' })

const habitsStore = useHabitsStore()
const settingsStore = useSettingsStore()

const today = todayDateKey()

function isCurrentlyPaused(habit: Habit): boolean {
  return isDateInHabitPause(habit, today)
}

const showArchived = ref(false)
const page = ref(1)
const itemsPerPage = 6

const filteredHabits = computed(() =>
  habitsStore.habits
    .filter(habit => (showArchived.value ? true : !habit.archived))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
)

const total = computed(() => filteredHabits.value.length)
const pagedHabits = computed(() => {
  const offset = (page.value - 1) * itemsPerPage
  return filteredHabits.value.slice(offset, offset + itemsPerPage)
})

type HabitType = 'build' | 'break'

const habitTypeMeta: Record<HabitType, { label: string, color: 'primary' | 'warning', cardClass: string, dotClass: string, icon: string, iconClass: string, badgeVariant: 'soft' }> = {
  build: {
    label: 'Build',
    color: 'primary',
    cardClass: 'border-primary',
    dotClass: 'bg-primary',
    icon: 'i-lucide-circle-check',
    iconClass: 'text-primary',
    badgeVariant: 'soft',
  },
  break: {
    label: 'Break',
    color: 'warning',
    cardClass: 'border-warning',
    dotClass: 'bg-warning',
    icon: 'i-lucide-circle-x',
    iconClass: 'text-warning',
    badgeVariant: 'soft',
  },
}

watch(total, (value) => {
  const maxPage = Math.max(1, Math.ceil(value / itemsPerPage))
  if (page.value > maxPage) {
    page.value = maxPage
  }
})

function toggleArchive(habitId: string, archived: boolean): void {
  if (archived) {
    habitsStore.restoreHabit(habitId)
    return
  }

  habitsStore.archiveHabit(habitId)
}

function scheduleLabel(weekdays: number[]): string {
  return sortWeekdaysForDisplay(weekdays, settingsStore.weekStartsOn)
    .map(day => WEEKDAY_LABELS[day] ?? String(day))
    .join(', ')
}

function typeMeta(type: HabitType): { label: string, color: 'primary' | 'warning', cardClass: string, dotClass: string, icon: string, iconClass: string, badgeVariant: 'soft' } {
  return habitTypeMeta[type]
}
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="space-y-2">
            <div class="flex items-start justify-between gap-3">
              <h1 class="text-2xl font-semibold">
                Habits
              </h1>
              <UButton
                to="/app/habits/new"
                icon="i-lucide-plus"
                class="shrink-0"
              >
                Create habit
              </UButton>
            </div>
            <p class="text-sm text-muted">
              Plan, edit, and archive your good and bad habit systems.
            </p>
          </div>
        </template>

        <div class="space-y-2">
          <UCheckbox
            v-model="showArchived"
            label="Show archived habits"
            color="neutral"
          />
        </div>
      </UCard>

      <p
        v-if="total"
        class="px-1 text-sm text-muted"
      >
        {{ total }} habits shown
      </p>

      <UEmpty
        v-if="!total"
        icon="i-lucide-list-checks"
        title="No habits yet"
        description="Create your first habit and start collecting identity votes."
        :actions="[{ label: 'Create habit', to: '/app/habits/new', icon: 'i-lucide-plus' }]"
      />

      <div
        v-else
        class="grid gap-4 md:grid-cols-2"
      >
        <UCard
          v-for="habit in pagedHabits"
          :key="habit.id"
          variant="outline"
          :class="['habit-card', typeMeta(habit.type).cardClass]"
        >
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="typeMeta(habit.type).icon"
                    class="size-4"
                    :class="typeMeta(habit.type).iconClass"
                  />
                  <h2 class="font-semibold">
                    {{ habit.name }}
                  </h2>
                </div>
                <p class="text-sm text-muted">
                  {{ habit.identityStatement }}
                </p>
              </div>
              <UBadge
                :color="typeMeta(habit.type).color"
                :variant="typeMeta(habit.type).badgeVariant"
              >
                {{ typeMeta(habit.type).label }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <div class="flex flex-wrap gap-2">
              <UBadge
                color="neutral"
                variant="outline"
              >
                Days: {{ scheduleLabel(habit.scheduleWeekdays) }}
              </UBadge>
              <UBadge
                color="neutral"
                variant="outline"
              >
                Reminder: {{ habit.reminderTime ?? 'none' }}
              </UBadge>
              <UBadge
                :color="habit.archived ? 'warning' : 'success'"
                variant="subtle"
              >
                {{ habit.archived ? 'Archived' : 'Active' }}
              </UBadge>
              <UBadge
                v-if="!habit.archived && isCurrentlyPaused(habit)"
                color="info"
                variant="subtle"
                icon="i-lucide-pause"
              >
                Paused
              </UBadge>
              <UBadge
                v-else-if="habit.pauses.length"
                color="neutral"
                variant="subtle"
                icon="i-lucide-pause"
              >
                {{ habit.pauses.length }} {{ habit.pauses.length === 1 ? 'pause' : 'pauses' }}
              </UBadge>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                :to="`/habits/${habit.id}`"
                icon="i-lucide-pencil"
              >
                Edit
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                :icon="habit.archived ? 'i-lucide-rotate-ccw' : 'i-lucide-archive'"
                @click="toggleArchive(habit.id, habit.archived)"
              >
                {{ habit.archived ? 'Restore' : 'Archive' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </div>

      <div
        v-if="total > itemsPerPage"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :items-per-page="itemsPerPage"
          :total="total"
          show-edges
        />
      </div>
    </div>
  </UPage>
</template>

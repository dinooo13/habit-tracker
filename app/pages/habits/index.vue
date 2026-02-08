<script setup lang="ts">
import { addDays, todayDateKey } from '~/utils/date'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()

const showArchived = ref(false)
const page = ref(1)
const itemsPerPage = 6
const weekdayLabels: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat'
}

const filteredHabits = computed(() =>
  habitsStore.habits
    .filter((habit) => (showArchived.value ? true : !habit.archived))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
)

const total = computed(() => filteredHabits.value.length)
const pagedHabits = computed(() => {
  const offset = (page.value - 1) * itemsPerPage
  return filteredHabits.value.slice(offset, offset + itemsPerPage)
})

const today = computed(() => todayDateKey())
const since30Days = computed(() => addDays(today.value, -29))

watch(total, (value) => {
  const maxPage = Math.max(1, Math.ceil(value / itemsPerPage))
  if (page.value > maxPage) {
    page.value = maxPage
  }
})

function completionRateForHabit(habitId: string): number {
  const habit = habitsStore.habitById(habitId)
  if (!habit) {
    return 0
  }

  return entriesStore.completionRateForHabit(habit, since30Days.value, today.value)
}

function toggleArchive(habitId: string, archived: boolean): void {
  if (archived) {
    habitsStore.restoreHabit(habitId)
    return
  }

  habitsStore.archiveHabit(habitId)
}

function scheduleLabel(weekdays: number[]): string {
  return weekdays.map((day) => weekdayLabels[day] ?? String(day)).join(', ')
}
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-2xl font-semibold">Habits</h1>
              <p class="text-sm text-muted">Plan, edit, and archive your good and bad habit systems.</p>
            </div>
            <UButton to="/habits/new" icon="i-lucide-plus">
              Create habit
            </UButton>
          </div>
        </template>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <UCheckbox v-model="showArchived" label="Show archived habits" color="neutral" />
          <p class="text-sm text-muted">{{ total }} habits</p>
        </div>
      </UCard>

      <UEmpty
        v-if="!total"
        icon="i-lucide-list-checks"
        title="No habits yet"
        description="Create your first habit and start collecting identity votes."
        :actions="[{ label: 'Create habit', to: '/habits/new', icon: 'i-lucide-plus' }]"
      />

      <div v-else class="grid gap-4 md:grid-cols-2">
        <UCard v-for="habit in pagedHabits" :key="habit.id">
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="font-semibold">{{ habit.name }}</h2>
                <p class="text-sm text-muted">{{ habit.identityStatement }}</p>
              </div>
              <UBadge :color="habit.type === 'build' ? 'success' : 'warning'" variant="subtle">
                {{ habit.type }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <div class="flex flex-wrap gap-2">
              <UBadge color="neutral" variant="outline">
                Days: {{ scheduleLabel(habit.scheduleWeekdays) }}
              </UBadge>
              <UBadge color="neutral" variant="outline">
                Reminder: {{ habit.reminderTime ?? 'none' }}
              </UBadge>
              <UBadge :color="habit.archived ? 'warning' : 'success'" variant="subtle">
                {{ habit.archived ? 'archived' : 'active' }}
              </UBadge>
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-sm text-muted">
                <span>30-day completion</span>
                <span>{{ completionRateForHabit(habit.id) }}%</span>
              </div>
              <UProgress :model-value="completionRateForHabit(habit.id)" />
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton size="sm" color="neutral" variant="ghost" :to="`/habits/${habit.id}`" icon="i-lucide-pencil">
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

      <div v-if="total > itemsPerPage" class="flex justify-center">
        <UPagination v-model:page="page" :items-per-page="itemsPerPage" :total="total" show-edges />
      </div>
    </div>
  </UPage>
</template>

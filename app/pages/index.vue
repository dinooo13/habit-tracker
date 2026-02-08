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

const progressValue = computed(() => {
  if (!dueHabitModels.value.length) {
    return 0
  }

  return Math.round((doneCount.value / dueHabitModels.value.length) * 100)
})

const pendingReflections = computed(() => entriesStore.pendingReflectionEntries)

const tabItems: TabsItem[] = [
  { label: 'All due', icon: 'i-lucide-list-checks', slot: 'all' },
  { label: 'Open', icon: 'i-lucide-clock-3', slot: 'open' },
  { label: 'Completed', icon: 'i-lucide-check-circle-2', slot: 'done' },
  { label: 'Missed', icon: 'i-lucide-circle-off', slot: 'missed' }
]

const openHabits = computed(() => dueHabitModels.value.filter((model) => !model.entry || model.entry.status === 'skipped'))
const doneHabits = computed(() => dueHabitModels.value.filter((model) => model.entry?.status === 'done'))
const missedHabits = computed(() => dueHabitModels.value.filter((model) => model.entry?.status === 'missed'))

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
          <div class="flex items-center justify-between text-sm text-muted">
            <span>{{ doneCount }} of {{ dueHabitModels.length }} done</span>
            <span>{{ progressValue }}%</span>
          </div>
          <UProgress :model-value="progressValue" />
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

        <UTabs v-else :items="tabItems" variant="link" color="neutral" class="w-full">
          <template #all>
            <div class="mt-4 grid gap-4">
              <UCard v-for="model in dueHabitModels" :key="model.habit.id" variant="outline">
                <div class="space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-semibold">{{ model.habit.name }}</h3>
                      <p class="text-sm text-muted">{{ model.habit.identityStatement }}</p>
                    </div>
                    <UBadge :color="model.habit.type === 'build' ? 'success' : 'warning'" variant="subtle">
                      {{ model.habit.type }}
                    </UBadge>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="outline">
                      Reminder: {{ model.habit.reminderTime ?? 'none' }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline">
                      Status: {{ model.entry?.status ?? 'open' }}
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

          <template #open>
            <div class="mt-4 space-y-2">
              <UAlert
                v-if="!openHabits.length"
                color="success"
                variant="subtle"
                title="No open habits"
                description="Everything due today has already been reviewed."
              />
              <UCard v-for="model in openHabits" :key="model.habit.id">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="font-medium">{{ model.habit.name }}</p>
                    <p class="text-sm text-muted">{{ model.habit.identityStatement }}</p>
                  </div>
                  <UButton size="sm" icon="i-lucide-check" @click="setHabitStatus(model.habit.id, 'done')">
                    Complete
                  </UButton>
                </div>
              </UCard>
            </div>
          </template>

          <template #done>
            <div class="mt-4 space-y-2">
              <UAlert v-if="!doneHabits.length" color="neutral" variant="outline" title="Nothing done yet" />
              <UCard v-for="model in doneHabits" :key="model.habit.id">
                <div class="flex items-center justify-between">
                  <p class="font-medium">{{ model.habit.name }}</p>
                  <UBadge color="success" variant="subtle">Done</UBadge>
                </div>
              </UCard>
            </div>
          </template>

          <template #missed>
            <div class="mt-4 space-y-2">
              <UAlert
                v-if="!missedHabits.length"
                color="neutral"
                variant="outline"
                title="No misses today"
                description="Great consistency so far."
              />
              <UCard v-for="model in missedHabits" :key="model.habit.id">
                <div class="flex items-center justify-between gap-3">
                  <p class="font-medium">{{ model.habit.name }}</p>
                  <UButton size="sm" color="warning" variant="subtle" to="/review" icon="i-lucide-message-square-more">
                    Reflect
                  </UButton>
                </div>
              </UCard>
            </div>
          </template>
        </UTabs>
      </UCard>
    </div>
  </UPage>
</template>

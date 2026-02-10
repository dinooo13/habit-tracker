<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { HabitType } from '~/types/app-data'

const habitsStore = useHabitsStore()
const router = useRouter()
const toast = useToast()

function onSubmit(payload: {
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  archived: boolean
}) {
  const habit = habitsStore.createHabit({
    name: payload.name,
    type: payload.type,
    identityStatement: payload.identityStatement,
    scheduleWeekdays: payload.scheduleWeekdays,
    reminderTime: payload.reminderTime,
    startDate: payload.startDate
  })

  if (payload.archived) {
    habitsStore.archiveHabit(habit.id)
  }

  toast.add({
    title: 'Habit created',
    description: `${habit.name} has been added to your plan.`,
    color: 'success'
  })

  router.push('/app/habits')
}
</script>

<template>
  <UPage>
    <UCard>
      <template #header>
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">Create habit</h1>
          <p class="text-sm text-muted">Define identity, schedule, and optional reminder.</p>
        </div>
      </template>

      <HabitForm submit-label="Create habit" @submit="onSubmit" />
    </UCard>
  </UPage>
</template>

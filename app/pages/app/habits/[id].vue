<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { HabitType } from '~/types/app-data'

const route = useRoute()
const router = useRouter()
const habitsStore = useHabitsStore()
const toast = useToast()

const habitId = computed(() => String(route.params.id))
const habit = computed(() => habitsStore.habitById(habitId.value) ?? null)

function onSubmit(payload: {
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  archived: boolean
}) {
  const updated = habitsStore.updateHabit(habitId.value, {
    name: payload.name,
    type: payload.type,
    identityStatement: payload.identityStatement,
    scheduleWeekdays: payload.scheduleWeekdays,
    reminderTime: payload.reminderTime,
    startDate: payload.startDate,
    archived: payload.archived
  })

  if (!updated) {
    toast.add({
      title: 'Habit not found',
      description: 'The habit could not be updated.',
      color: 'error'
    })
    return
  }

  toast.add({
    title: 'Habit updated',
    description: `${updated.name} has been saved.`,
    color: 'success'
  })

  router.push('/app/habits')
}
</script>

<template>
  <UPage>
    <UCard v-if="habit">
      <template #header>
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">Edit habit</h1>
          <p class="text-sm text-muted">Adjust schedule and coaching context.</p>
        </div>
      </template>

      <HabitForm :initial="habit" submit-label="Save changes" @submit="onSubmit" />
    </UCard>

    <UEmpty
      v-else
      icon="i-lucide-search-x"
      title="Habit not found"
      description="This habit may have been deleted."
      :actions="[{ label: 'Back to habits', to: '/app/habits', color: 'neutral' }]"
    />
  </UPage>
</template>

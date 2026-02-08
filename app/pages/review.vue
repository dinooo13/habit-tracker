<script setup lang="ts">
import type { MissReasonCode } from '~/types/app-data'
import { MISS_REASON_LABELS } from '~/utils/atomic-rules'
import { addDays, compareDateKeys, todayDateKey } from '~/utils/date'

const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()
const toast = useToast()

const pendingModels = computed(() =>
  entriesStore.pendingReflectionEntries
    .map((entry) => ({
      entry,
      habit: habitsStore.habitById(entry.habitId)
    }))
    .filter((model) => Boolean(model.habit))
)

const pendingHabitGroups = computed(() => {
  const grouped = new Map<string, { habitId: string, habitName: string, entryIds: string[], latestDate: string }>()

  for (const model of pendingModels.value) {
    const habit = model.habit
    if (!habit) {
      continue
    }

    const existing = grouped.get(habit.id)
    if (existing) {
      existing.entryIds.push(model.entry.id)
      continue
    }

    grouped.set(habit.id, {
      habitId: habit.id,
      habitName: habit.name,
      entryIds: [model.entry.id],
      latestDate: model.entry.date
    })
  }

  return [...grouped.values()]
})

const selectedEntryId = ref<string | null>(null)
const modalOpen = ref(false)

watch(
  pendingModels,
  (models) => {
    if (!models.length) {
      selectedEntryId.value = null
      modalOpen.value = false
      return
    }

    if (!selectedEntryId.value || !models.some((model) => model.entry.id === selectedEntryId.value)) {
      const firstModel = models.at(0)
      if (firstModel) {
        selectedEntryId.value = firstModel.entry.id
      }
    }
  },
  { immediate: true }
)

const selectedModel = computed(() =>
  pendingModels.value.find((model) => model.entry.id === selectedEntryId.value) ?? null
)
const hasNextPending = computed(
  () => Boolean(selectedEntryId.value) && pendingModels.value.some((model) => model.entry.id !== selectedEntryId.value)
)

const suggestionsCutoffDate = computed(() => addDays(todayDateKey(), -6))
const suggestionGroups = computed(() => {
  const sorted = [...coachStore.suggestions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const entriesById = new Map(entriesStore.entries.map((entry) => [entry.id, entry]))
  const groups = new Map<
    string,
    {
      habitId: string
      habitName: string
      suggestions: typeof sorted
    }
  >()

  for (const suggestion of sorted) {
    const entry = entriesById.get(suggestion.entryId)
    if (!entry || entry.status !== 'missed') {
      continue
    }

    if (compareDateKeys(entry.date, suggestionsCutoffDate.value) < 0) {
      continue
    }

    const habit = habitsStore.habitById(entry.habitId)
    if (!habit) {
      continue
    }

    const existing = groups.get(habit.id)
    if (existing) {
      if (existing.suggestions.length < 2) {
        existing.suggestions.push(suggestion)
      }
      continue
    }

    groups.set(habit.id, {
      habitId: habit.id,
      habitName: habit.name,
      suggestions: [suggestion]
    })
  }

  return [...groups.values()]
})

function openReflection(entryId: string): void {
  selectedEntryId.value = entryId
  modalOpen.value = true
}

function submitReflection(payload: { reason: MissReasonCode; note: string | null; action: 'close' | 'next' }): void {
  const model = selectedModel.value
  if (!model?.habit) {
    return
  }

  const currentEntryId = model.entry.id
  const nextEntryId =
    payload.action === 'next'
      ? pendingModels.value.find((model) => model.entry.id !== currentEntryId)?.entry.id ?? null
      : null

  const entry = entriesStore.setMissReason(model.entry.id, payload.reason, payload.note)
  if (!entry) {
    return
  }

  coachStore.generateForEntry(entry, model.habit)
  const remaining = pendingModels.value.length
  toast.add({
    title: 'Reflection saved',
    description:
      remaining > 0
        ? `Reason captured: ${MISS_REASON_LABELS[payload.reason]} · ${remaining} remaining`
        : `Reason captured: ${MISS_REASON_LABELS[payload.reason]} · all done`,
    color: 'success'
  })

  if (nextEntryId) {
    selectedEntryId.value = nextEntryId
    modalOpen.value = true
  } else {
    modalOpen.value = false
  }
}

</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="space-y-1">
            <h1 class="text-2xl font-semibold">Review missed habits</h1>
            <p class="text-sm text-muted">
              Reflect on misses to generate Atomic Habits tactics for your next attempt.
            </p>
          </div>
        </template>

        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-message-square-warning"
          :title="`${pendingModels.length} reflections pending`"
          description="When a habit is missed, capture the reason so recommendations can adapt."
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Pending reflections</h2>
        </template>

        <UEmpty
          v-if="!pendingModels.length"
          icon="i-lucide-check-check"
          title="No pending reflections"
          description="All missed habits already have coaching context."
        />

        <div v-else class="space-y-3">
          <UCard v-for="group in pendingHabitGroups" :key="group.habitId" variant="outline">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="font-semibold">{{ group.habitName }}</p>
                <p class="text-sm text-muted">
                  {{ group.entryIds.length }} pending
                  · latest miss on {{ group.latestDate }}
                </p>
              </div>
              <UButton color="warning" variant="soft" icon="i-lucide-pencil" @click="openReflection(group.entryIds[0] as string)">
                Reflect latest
              </UButton>
            </div>
          </UCard>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">Coaching suggestions</h2>
            <UTooltip text="Shows up to 2 suggestions per habit based on habits missed in the last 7 days.">
              <UButton
                icon="i-lucide-circle-help"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Suggestions info"
              />
            </UTooltip>
          </div>
        </template>

        <UEmpty
          v-if="!suggestionGroups.length"
          icon="i-lucide-lightbulb"
          title="No coaching yet"
          description="Add reflection details to generate Atomic Habits recommendations."
        />

        <div v-else class="grid gap-3 md:grid-cols-2">
          <UCard v-for="group in suggestionGroups" :key="group.habitId" variant="outline">
            <div class="space-y-2">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div class="min-w-0 space-y-1">
                  <h3 class="truncate font-semibold">{{ group.habitName }}</h3>
                  <p class="text-xs text-muted">
                    {{ group.suggestions.length }} suggestion{{ group.suggestions.length === 1 ? '' : 's' }} from last 7 days
                  </p>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  class="shrink-0 whitespace-nowrap"
                  icon="i-lucide-arrow-up-right"
                  :to="`/habits/${group.habitId}`"
                >
                  Edit habit
                </UButton>
              </div>

              <div class="border-t border-default/60 pt-3">
                <div class="space-y-3">
                  <div v-for="suggestion in group.suggestions" :key="suggestion.id" class="space-y-1">
                    <UBadge :color="suggestion.direction === 'increase' ? 'success' : 'warning'" variant="subtle">
                      {{ suggestion.law }} · {{ suggestion.direction }}
                    </UBadge>
                    <p class="font-semibold">{{ suggestion.title }}</p>
                    <p class="text-sm text-muted">{{ suggestion.action }}</p>
                    <p class="text-xs text-muted">{{ suggestion.rationale }}</p>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </UCard>
    </div>

    <ReflectionModal
      v-if="selectedModel"
      v-model:open="modalOpen"
      :habit-name="selectedModel.habit?.name ?? ''"
      :date="selectedModel.entry.date"
      :has-next="hasNextPending"
      @submit="submitReflection"
    />
  </UPage>
</template>

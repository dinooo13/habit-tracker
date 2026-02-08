<script setup lang="ts">
import type { MissReasonCode } from '~/types/app-data'
import { MISS_REASON_LABELS } from '~/utils/atomic-rules'

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

const recentSuggestions = computed(() =>
  [...coachStore.suggestions].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 12)
)

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

function suggestionHabitName(entryId: string): string {
  const entry = entriesStore.entries.find((candidate) => candidate.id === entryId)
  if (!entry) {
    return 'Unknown habit'
  }

  return habitsStore.habitById(entry.habitId)?.name ?? 'Unknown habit'
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
          <h2 class="text-lg font-semibold">Recent coaching suggestions</h2>
        </template>

        <UEmpty
          v-if="!recentSuggestions.length"
          icon="i-lucide-lightbulb"
          title="No coaching yet"
          description="Add reflection details to generate Atomic Habits recommendations."
        />

        <div v-else class="grid gap-3 md:grid-cols-2">
          <UCard v-for="suggestion in recentSuggestions" :key="suggestion.id" variant="outline">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="outline">{{ suggestionHabitName(suggestion.entryId) }}</UBadge>
                <UBadge :color="suggestion.direction === 'increase' ? 'success' : 'warning'" variant="subtle">
                  {{ suggestion.law }} · {{ suggestion.direction }}
                </UBadge>
              </div>
              <p class="font-semibold">{{ suggestion.title }}</p>
              <p class="text-sm text-muted">{{ suggestion.action }}</p>
              <p class="text-xs text-muted">{{ suggestion.rationale }}</p>
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

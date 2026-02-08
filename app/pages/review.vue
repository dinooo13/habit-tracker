<script setup lang="ts">
import type { CoachingSuggestion, MissReasonCode } from '~/types/app-data'
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

interface SuggestionGroup {
  habitId: string
  habitName: string
  suggestions: CoachingSuggestion[]
  missedCount: number
}

const suggestionsCutoffDate = computed(() => addDays(todayDateKey(), -6))
const suggestionGroups = computed<SuggestionGroup[]>(() => {
  const sorted = [...coachStore.suggestions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const entriesById = new Map(entriesStore.entries.map((entry) => [entry.id, entry]))
  const groups = new Map<
    string,
    {
      habitId: string
      habitName: string
      suggestions: CoachingSuggestion[]
      missedEntryIds: Set<string>
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
      existing.suggestions.push(suggestion)
      existing.missedEntryIds.add(entry.id)
      continue
    }

    groups.set(habit.id, {
      habitId: habit.id,
      habitName: habit.name,
      suggestions: [suggestion],
      missedEntryIds: new Set([entry.id])
    })
  }

  return [...groups.values()].map((group) => ({
    habitId: group.habitId,
    habitName: group.habitName,
    suggestions: group.suggestions,
    missedCount: group.missedEntryIds.size
  }))
})

const expandedSuggestionRationale = ref<Record<string, boolean>>({})
const suggestionIndexByHabit = ref<Record<string, number>>({})

function suggestionLabel(suggestion: CoachingSuggestion): string {
  return `${suggestion.law} · ${suggestion.direction}`
}

function suggestionBadgeColor(direction: CoachingSuggestion['direction']): 'success' | 'warning' {
  return direction === 'increase' ? 'success' : 'warning'
}

function activeSuggestion(group: SuggestionGroup): CoachingSuggestion | null {
  if (!group.suggestions.length) {
    return null
  }

  const index = suggestionIndexByHabit.value[group.habitId] ?? 0
  return group.suggestions[index] ?? group.suggestions[0] ?? null
}

function showAnotherSuggestion(group: SuggestionGroup): void {
  if (group.suggestions.length < 2) {
    return
  }

  const currentIndex = suggestionIndexByHabit.value[group.habitId] ?? 0
  suggestionIndexByHabit.value[group.habitId] = (currentIndex + 1) % group.suggestions.length
}

function activeSuggestionId(group: SuggestionGroup): string | null {
  return activeSuggestion(group)?.id ?? null
}

function activeSuggestionLabel(group: SuggestionGroup): string {
  const suggestion = activeSuggestion(group)
  return suggestion ? suggestionLabel(suggestion) : ''
}

function activeSuggestionBadgeColor(group: SuggestionGroup): 'success' | 'warning' {
  const suggestion = activeSuggestion(group)
  return suggestionBadgeColor(suggestion?.direction ?? 'increase')
}

function activeSuggestionTitle(group: SuggestionGroup): string {
  return activeSuggestion(group)?.title ?? ''
}

function activeSuggestionAction(group: SuggestionGroup): string {
  return activeSuggestion(group)?.action ?? ''
}

function activeSuggestionRationale(group: SuggestionGroup): string {
  return activeSuggestion(group)?.rationale ?? ''
}

function isSuggestionRationaleExpanded(suggestionId: string): boolean {
  return Boolean(expandedSuggestionRationale.value[suggestionId])
}

function toggleSuggestionRationale(suggestionId: string): void {
  expandedSuggestionRationale.value[suggestionId] = !isSuggestionRationaleExpanded(suggestionId)
}

function openReflection(entryId: string): void {
  selectedEntryId.value = entryId
  modalOpen.value = true
}

function openLatestReflection(entryIds: string[]): void {
  const entryId = entryIds[0]
  if (!entryId) {
    return
  }

  openReflection(entryId)
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
              <UButton color="warning" variant="soft" icon="i-lucide-pencil" @click="openLatestReflection(group.entryIds)">
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
            <UTooltip text="Suggestions are based on habits missed in the last 7 days. One suggestion is shown at a time.">
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
              <div class="space-y-2 sm:flex sm:items-start sm:justify-between sm:gap-2">
                <div class="min-w-0 space-y-1">
                  <h3
                    class="overflow-hidden font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                  >
                    {{ group.habitName }}
                  </h3>
                  <p class="text-xs text-muted">
                    Missed {{ group.missedCount }} time{{ group.missedCount === 1 ? '' : 's' }} in the last 7 days
                  </p>
                </div>
              </div>

              <div class="border-t border-default/60 pt-3">
                <div v-if="activeSuggestion(group)" class="space-y-2">
                  <UBadge :color="activeSuggestionBadgeColor(group)" variant="soft">
                    {{ activeSuggestionLabel(group) }}
                  </UBadge>
                  <p class="font-semibold">{{ activeSuggestionTitle(group) }}</p>
                  <p class="text-sm text-muted">{{ activeSuggestionAction(group) }}</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :icon="isSuggestionRationaleExpanded(activeSuggestionId(group) ?? '') ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      @click="toggleSuggestionRationale(activeSuggestionId(group) ?? '')"
                    >
                      Why this helps
                    </UButton>
                    <UButton
                      v-if="group.suggestions.length > 1"
                      size="xs"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-refresh-cw"
                      @click="showAnotherSuggestion(group)"
                    >
                      Show another suggestion
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-arrow-up-right"
                      :to="`/habits/${group.habitId}`"
                    >
                      Edit habit
                    </UButton>
                  </div>
                  <p v-if="isSuggestionRationaleExpanded(activeSuggestionId(group) ?? '')" class="text-xs text-muted">
                    {{ activeSuggestionRationale(group) }}
                  </p>
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

<script setup lang="ts">
import { MISS_REASON_CODES, type MissReasonCode } from '~/types/app-data'
import { MISS_REASON_LABELS } from '~/utils/atomic-rules'

const props = defineProps<{
  open: boolean
  habitName: string
  date: string
  hasNext: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { reason: MissReasonCode; note: string | null; action: 'close' | 'next' }]
}>()

const state = reactive({
  reason: 'forgot' as MissReasonCode,
  note: ''
})

const reasonItems = MISS_REASON_CODES.map((code) => ({
  label: MISS_REASON_LABELS[code],
  value: code
}))

watch(
  () => props.open,
  (value) => {
    if (value) {
      state.reason = 'forgot'
      state.note = ''
    }
  }
)

function submit(action: 'close' | 'next'): void {
  emit('submit', {
    reason: state.reason,
    note: state.note.trim() || null,
    action
  })
  emit('update:open', false)
}
</script>

<template>
  <UModal :open="open" title="Missed habit reflection" description="Capture why this slipped so the coach can suggest better tactics." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-lightbulb"
          :title="habitName"
          :description="`Scheduled for ${date}`"
        />

        <UFormField label="Why did this habit miss?" required>
          <USelect v-model="state.reason" :items="reasonItems" value-key="value" class="w-full" />
        </UFormField>

        <UFormField label="Optional details">
          <UTextarea
            v-model="state.note"
            class="w-full"
            :rows="4"
            placeholder="What specifically happened?"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">
          Cancel
        </UButton>
        <UButton color="neutral" variant="outline" size="sm" class="whitespace-nowrap" icon="i-lucide-check" @click="submit('close')">
          Save
        </UButton>
        <UTooltip v-if="hasNext" text="Saves and opens next reflection">
          <UButton size="sm" class="whitespace-nowrap" icon="i-lucide-arrow-right" @click="submit('next')">
            Next
          </UButton>
        </UTooltip>
      </div>
    </template>
  </UModal>
</template>

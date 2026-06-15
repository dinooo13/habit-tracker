<script setup lang="ts">
import { Time } from '@internationalized/date'
import type { FormSubmitEvent, RadioGroupItem } from '@nuxt/ui'
import { z } from 'zod'
import type { Habit, HabitType } from '~/types/app-data'
import { formatTimeString, isValidDateKey, MAX_DATE_KEY, MIN_DATE_KEY, parseTimeString, todayDateKey } from '~/utils/date'

interface HabitFormPayload {
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  archived: boolean
}

const props = withDefaults(
  defineProps<{
    initial?: Habit | null
    submitLabel?: string
  }>(),
  {
    initial: null,
    submitLabel: 'Save habit'
  }
)

const emit = defineEmits<{
  submit: [payload: HabitFormPayload]
}>()

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  type: z.enum(['build', 'break']),
  identityStatement: z.string().min(5, 'Identity statement should be specific.'),
  startDate: z
    .string()
    .min(1, 'Start date is required.')
    .refine(isValidDateKey, 'Start date must be a real date between 2000 and 2100.')
})

type Schema = z.output<typeof schema>

const state = reactive<Schema & { archived: boolean }>({
  name: props.initial?.name ?? '',
  type: props.initial?.type ?? 'build',
  identityStatement: props.initial?.identityStatement ?? '',
  startDate: props.initial?.startDate ?? todayDateKey(),
  archived: props.initial?.archived ?? false
})

const dayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
]

const dayState = reactive<Record<number, boolean>>({
  0: props.initial?.scheduleWeekdays.includes(0) ?? false,
  1: props.initial?.scheduleWeekdays.includes(1) ?? true,
  2: props.initial?.scheduleWeekdays.includes(2) ?? true,
  3: props.initial?.scheduleWeekdays.includes(3) ?? true,
  4: props.initial?.scheduleWeekdays.includes(4) ?? true,
  5: props.initial?.scheduleWeekdays.includes(5) ?? true,
  6: props.initial?.scheduleWeekdays.includes(6) ?? false
})

const initialTime = parseTimeString(props.initial?.reminderTime ?? null)
const reminderTime = shallowRef<Time | null>(
  initialTime ? new Time(initialTime.hour, initialTime.minute, 0) : null
)

const typeOptions: RadioGroupItem[] = [
  {
    value: 'build',
    label: 'Build good habit',
    description: 'Use the 4 laws to make the habit obvious, attractive, easy, and satisfying.'
  },
  {
    value: 'break',
    label: 'Break bad habit',
    description: 'Invert the 4 laws to make the behavior invisible, unattractive, difficult, and unsatisfying.'
  }
]

const toast = useToast()

function buildScheduleWeekdays(): number[] {
  return dayOptions
    .map((option) => option.value)
    .filter((weekday) => dayState[weekday])
    .sort((left, right) => left - right)
}

function timeToString(value: Time | null): string | null {
  if (!value) {
    return null
  }

  return formatTimeString(value.hour, value.minute)
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  const weekdays = buildScheduleWeekdays()
  if (!weekdays.length) {
    toast.add({
      title: 'Select at least one day',
      description: 'A habit needs at least one planned weekday.',
      color: 'warning'
    })
    return
  }

  emit('submit', {
    name: event.data.name,
    type: event.data.type,
    identityStatement: event.data.identityStatement,
    startDate: event.data.startDate,
    archived: state.archived,
    scheduleWeekdays: weekdays,
    reminderTime: timeToString(reminderTime.value)
  })
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-6" @submit="onSubmit">
    <UFormField label="Habit name" name="name" required>
      <UInput v-model="state.name" class="w-full" placeholder="Read 10 pages" />
    </UFormField>

    <UFormField label="Habit type" name="type" required>
      <URadioGroup v-model="state.type" :items="typeOptions" value-key="value" variant="table" />
    </UFormField>

    <UFormField label="Identity statement" name="identityStatement" required help="Example: I am a person who protects my focus every day.">
      <UInput v-model="state.identityStatement" class="w-full" placeholder="I am a person who..." />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Start date" name="startDate" required>
        <UInput v-model="state.startDate" class="w-full" type="date" :min="MIN_DATE_KEY" :max="MAX_DATE_KEY" />
      </UFormField>

      <UFormField label="Reminder time" help="Optional local notification time.">
        <UInputTime v-model="reminderTime" :hour-cycle="24" icon="i-lucide-clock-3" />
      </UFormField>
    </div>

    <UFormField label="Schedule weekdays" help="Pick when this habit is due.">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <UCheckbox
          v-for="day in dayOptions"
          :key="day.value"
          v-model="dayState[day.value]"
          :label="day.label"
          variant="card"
          color="neutral"
        />
      </div>
    </UFormField>

    <UCheckbox
      v-model="state.archived"
      label="Archive this habit"
      description="Archived habits stay in history but are removed from active planning."
      color="neutral"
    />

    <div class="flex justify-end">
      <UButton type="submit" icon="i-lucide-save" size="md">
        {{ submitLabel }}
      </UButton>
    </div>
  </UForm>
</template>

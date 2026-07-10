<script setup lang="ts">
import { Time } from '@internationalized/date'
import type { FormSubmitEvent, RadioGroupItem } from '@nuxt/ui'
import { z } from 'zod'
import type { Habit, HabitPause, HabitType } from '~/types/app-data'
import { compareDateKeys, formatTimeString, isValidDateKey, MAX_DATE_KEY, MIN_DATE_KEY, parseTimeString, todayDateKey } from '~/utils/domain/date'

interface HabitFormPayload {
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  archived: boolean
  pauses: HabitPause[]
}

const props = withDefaults(
  defineProps<{
    initial?: Habit | null
    submitLabel?: string
  }>(),
  {
    initial: null,
    submitLabel: 'Save habit',
  },
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
    .refine(isValidDateKey, 'Start date must be a real date between 2000 and 2100.'),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema & { archived: boolean }>({
  name: props.initial?.name ?? '',
  type: props.initial?.type ?? 'build',
  identityStatement: props.initial?.identityStatement ?? '',
  startDate: props.initial?.startDate ?? todayDateKey(),
  archived: props.initial?.archived ?? false,
})

const dayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const dayState = reactive<Record<number, boolean>>({
  0: props.initial?.scheduleWeekdays.includes(0) ?? false,
  1: props.initial?.scheduleWeekdays.includes(1) ?? true,
  2: props.initial?.scheduleWeekdays.includes(2) ?? true,
  3: props.initial?.scheduleWeekdays.includes(3) ?? true,
  4: props.initial?.scheduleWeekdays.includes(4) ?? true,
  5: props.initial?.scheduleWeekdays.includes(5) ?? true,
  6: props.initial?.scheduleWeekdays.includes(6) ?? false,
})

const initialTime = parseTimeString(props.initial?.reminderTime ?? null)
const reminderTime = shallowRef<Time | null>(
  initialTime ? new Time(initialTime.hour, initialTime.minute, 0) : null,
)

// Pause ranges: each row is an editable `{ start, end }` of local date keys.
// Days inside any pause are never due (ADR-0010). Rows are validated on submit.
const pauses = ref<HabitPause[]>(
  (props.initial?.pauses ?? []).map(pause => ({ start: pause.start, end: pause.end })),
)

function addPause(): void {
  const today = todayDateKey()
  pauses.value.push({ start: today, end: today })
}

function removePause(index: number): void {
  pauses.value.splice(index, 1)
}

const typeOptions: RadioGroupItem[] = [
  {
    value: 'build',
    label: 'Build good habit',
    description: 'Use the 4 laws to make the habit obvious, attractive, easy, and satisfying.',
  },
  {
    value: 'break',
    label: 'Break bad habit',
    description: 'Invert the 4 laws to make the behavior invisible, unattractive, difficult, and unsatisfying.',
  },
]

const toast = useToast()

function buildScheduleWeekdays(): number[] {
  return dayOptions
    .map(option => option.value)
    .filter(weekday => dayState[weekday])
    .sort((left, right) => left - right)
}

function timeToString(value: Time | null): string | null {
  if (!value) {
    return null
  }

  return formatTimeString(value.hour, value.minute)
}

function buildPauses(): HabitPause[] | null {
  const cleaned: HabitPause[] = []

  for (const pause of pauses.value) {
    const start = pause.start
    const end = pause.end

    if (!isValidDateKey(start) || !isValidDateKey(end)) {
      return null
    }

    if (compareDateKeys(end, start) < 0) {
      return null
    }

    cleaned.push({ start, end })
  }

  return cleaned.sort(
    (left, right) => compareDateKeys(left.start, right.start) || compareDateKeys(left.end, right.end),
  )
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  const weekdays = buildScheduleWeekdays()
  if (!weekdays.length) {
    toast.add({
      title: 'Select at least one day',
      description: 'A habit needs at least one planned weekday.',
      color: 'warning',
    })
    return
  }

  const cleanedPauses = buildPauses()
  if (!cleanedPauses) {
    toast.add({
      title: 'Check your pause dates',
      description: 'Each pause needs a valid start and an end on or after the start.',
      color: 'warning',
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
    reminderTime: timeToString(reminderTime.value),
    pauses: cleanedPauses,
  })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-6"
    @submit="onSubmit"
  >
    <UFormField
      label="Habit name"
      name="name"
      required
    >
      <UInput
        v-model="state.name"
        class="w-full"
        placeholder="Read 10 pages"
      />
    </UFormField>

    <UFormField
      label="Habit type"
      name="type"
      required
    >
      <URadioGroup
        v-model="state.type"
        :items="typeOptions"
        value-key="value"
        variant="table"
      />
    </UFormField>

    <UFormField
      label="Identity statement"
      name="identityStatement"
      required
      help="Example: I am a person who protects my focus every day."
    >
      <UInput
        v-model="state.identityStatement"
        class="w-full"
        placeholder="I am a person who..."
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        label="Start date"
        name="startDate"
        required
      >
        <UInput
          v-model="state.startDate"
          class="w-full"
          type="date"
          :min="MIN_DATE_KEY"
          :max="MAX_DATE_KEY"
        />
      </UFormField>

      <UFormField
        label="Reminder time"
        help="Optional local notification time."
      >
        <UInputTime
          v-model="reminderTime"
          :hour-cycle="24"
          icon="i-lucide-clock-3"
        />
      </UFormField>
    </div>

    <UFormField
      label="Schedule weekdays"
      help="Pick when this habit is due."
    >
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

    <UFormField
      label="Pauses"
      help="Pause this habit for a date range (e.g. travel). Paused days are never due and won't be marked missed."
    >
      <div class="space-y-3">
        <div
          v-if="!pauses.length"
          class="text-sm text-muted"
        >
          No pauses. Add a range to take a planned break without breaking your streak.
        </div>

        <div
          v-for="(pause, index) in pauses"
          :key="index"
          class="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <UFormField :label="index === 0 ? 'From' : undefined">
            <UInput
              v-model="pause.start"
              class="w-full"
              type="date"
              :min="MIN_DATE_KEY"
              :max="MAX_DATE_KEY"
            />
          </UFormField>
          <UFormField :label="index === 0 ? 'To' : undefined">
            <UInput
              v-model="pause.end"
              class="w-full"
              type="date"
              :min="pause.start || MIN_DATE_KEY"
              :max="MAX_DATE_KEY"
            />
          </UFormField>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="`Remove pause ${index + 1}`"
            @click="removePause(index)"
          />
        </div>

        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          size="sm"
          @click="addPause"
        >
          Add pause
        </UButton>
      </div>
    </UFormField>

    <UCheckbox
      v-model="state.archived"
      label="Archive this habit"
      description="Archived habits stay in history but are removed from active planning."
      color="neutral"
    />

    <div class="flex justify-end">
      <UButton
        type="submit"
        icon="i-lucide-save"
        size="md"
      >
        {{ submitLabel }}
      </UButton>
    </div>
  </UForm>
</template>

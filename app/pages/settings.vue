<script setup lang="ts">
import { Time } from '@internationalized/date'
import type { ChipProps, SelectItem } from '@nuxt/ui'
import type { Habit, PrimaryColor } from '~/types/app-data'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'
import { formatTimeString, nowIso, parseTimeString, todayDateKey } from '~/utils/date'
import { createId } from '~/utils/id'
import { PRIMARY_COLOR_LABELS } from '~/utils/primary-color'

const settingsStore = useSettingsStore()
const habitsStore = useHabitsStore()
const entriesStore = useEntriesStore()
const coachStore = useCoachStore()

const reminderEngine = useReminderEngine()
const persistence = usePersistence()
const toast = useToast()

const notificationEnabled = computed({
  get: () => settingsStore.notificationsEnabled,
  set: (value: boolean) => settingsStore.setNotificationsEnabled(value)
})

const weekStartsOnItems = [
  { label: 'Monday', value: 1 },
  { label: 'Sunday', value: 0 }
]

const weekStartsOn = computed({
  get: () => settingsStore.weekStartsOn,
  set: (value: 0 | 1) => settingsStore.setWeekStartsOn(value)
})

const primaryColorChips: Record<PrimaryColor, ChipProps> = {
  sky: { ui: { base: 'primary-color-chip-base primary-color-chip-sky' } },
  emerald: { ui: { base: 'primary-color-chip-base primary-color-chip-emerald' } },
  violet: { ui: { base: 'primary-color-chip-base primary-color-chip-violet' } },
  rose: { ui: { base: 'primary-color-chip-base primary-color-chip-rose' } },
  amber: { ui: { base: 'primary-color-chip-base primary-color-chip-amber' } }
}

const primaryColorItems = Object.entries(PRIMARY_COLOR_LABELS).map(([value, label]) => ({
  value: value as PrimaryColor,
  label,
  chip: primaryColorChips[value as PrimaryColor]
})) satisfies SelectItem[]

function getPrimaryColorChip(value: string | undefined): ChipProps | undefined {
  return primaryColorItems.find(item => item.value === value)?.chip
}

const primaryColor = computed({
  get: () => settingsStore.primaryColor,
  set: (value: PrimaryColor) => settingsStore.setPrimaryColor(value)
})

const initialTime = parseTimeString(settingsStore.dailyReviewTime)
const dailyReviewTime = shallowRef<Time | null>(
  initialTime ? new Time(initialTime.hour, initialTime.minute, 0) : null
)

watch(dailyReviewTime, (value) => {
  if (!value) {
    settingsStore.setDailyReviewTime(null)
    return
  }

  settingsStore.setDailyReviewTime(formatTimeString(value.hour, value.minute))
})

const notificationPermission = ref<NotificationPermission>(reminderEngine.currentPermission())

const notificationPermissionIndicator = computed(() => {
  if (notificationPermission.value === 'granted') {
    return { icon: 'i-lucide-bell-ring', color: 'success' as const }
  }

  if (notificationPermission.value === 'denied') {
    return { icon: 'i-lucide-bell-off', color: 'error' as const }
  }

  return { icon: 'i-lucide-bell-dot', color: 'warning' as const }
})

const notificationPermissionLabel = computed(() => {
  if (notificationPermission.value === 'granted') {
    return 'granted'
  }

  if (notificationPermission.value === 'denied') {
    return 'denied'
  }

  return 'not set'
})

const importModalOpen = ref(false)
const importHabitsOnly = ref(false)
const importFile = ref<File | null>(null)
const deleteAllModalOpen = ref(false)

function resetImportModalState(): void {
  importHabitsOnly.value = false
  importFile.value = null
}

watch(importModalOpen, (open) => {
  if (open) {
    resetImportModalState()
  }
})

async function requestPermission(): Promise<void> {
  notificationPermission.value = await reminderEngine.requestPermission()

  if (notificationPermission.value === 'granted') {
    settingsStore.setNotificationsEnabled(true)
  }

  toast.add({
    title: `Notification permission: ${notificationPermission.value}`,
    color: notificationPermission.value === 'granted' ? 'success' : 'warning'
  })
}

function buildCurrentPayload() {
  return {
    schemaVersion: 1,
    habits: habitsStore.snapshot(),
    entries: entriesStore.snapshot(),
    suggestions: coachStore.snapshot(),
    settings: settingsStore.snapshot()
  }
}

function downloadBackup(payload: ReturnType<typeof buildCurrentPayload>): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `habit-tracker-${todayDateKey()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportJson(): void {
  const payload = buildCurrentPayload()
  downloadBackup(payload)

  toast.add({ title: 'Export complete', color: 'success' })
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

function normalizeImportedHabit(payload: unknown): Habit | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as Record<string, unknown>
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  const type = candidate.type === 'build' || candidate.type === 'break' ? candidate.type : null
  const identityStatement = typeof candidate.identityStatement === 'string' ? candidate.identityStatement.trim() : ''
  const weekdayValues = Array.isArray(candidate.scheduleWeekdays)
    ? [...new Set(candidate.scheduleWeekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : []
  const startDate = typeof candidate.startDate === 'string' && DATE_KEY_REGEX.test(candidate.startDate)
    ? candidate.startDate
    : todayDateKey()
  const reminderTime = typeof candidate.reminderTime === 'string' && TIME_REGEX.test(candidate.reminderTime)
    ? candidate.reminderTime
    : null

  if (!name || !type || !identityStatement || !weekdayValues.length) {
    return null
  }

  const now = nowIso()

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createId('habit'),
    name,
    type,
    identityStatement,
    scheduleWeekdays: weekdayValues,
    reminderTime,
    startDate,
    archived: typeof candidate.archived === 'boolean' ? candidate.archived : false,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt.trim() ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim() ? candidate.updatedAt : now
  }
}

function extractHabitsFromImportPayload(payload: unknown): Habit[] {
  try {
    return parseAppData(payload).habits
  } catch {
    // Continue with habits-only payload formats.
  }

  const rawHabits = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { habits?: unknown }).habits)
      ? (payload as { habits: unknown[] }).habits
      : null

  if (!rawHabits) {
    return []
  }

  return rawHabits
    .map((item) => normalizeImportedHabit(item))
    .filter((item): item is Habit => Boolean(item))
}

function persistCurrentState(): void {
  persistence.save({
    schemaVersion: 1,
    habits: habitsStore.snapshot(),
    entries: entriesStore.snapshot(),
    suggestions: coachStore.snapshot(),
    settings: settingsStore.snapshot()
  })
}

function syncDailyReviewTimeFromSettings(): void {
  const parsedTime = parseTimeString(settingsStore.dailyReviewTime)
  dailyReviewTime.value = parsedTime ? new Time(parsedTime.hour, parsedTime.minute, 0) : null
}

function onImportFileSelected(event: Event): void {
  const target = event.target as HTMLInputElement
  importFile.value = target.files?.[0] ?? null
}

async function confirmImport(): Promise<void> {
  const file = importFile.value
  if (!file) {
    toast.add({
      title: 'No file selected',
      description: 'Choose a JSON file before importing.',
      color: 'warning'
    })
    return
  }

  try {
    const text = await file.text()
    const payload = JSON.parse(text)

    if (importHabitsOnly.value) {
      const importedHabits = extractHabitsFromImportPayload(payload)
      if (!importedHabits.length) {
        toast.add({
          title: 'Import failed',
          description: 'No valid habits were found in the selected file.',
          color: 'error'
        })
        return
      }

      const existingHabits = habitsStore.snapshot()
      const existingIds = new Set(existingHabits.map((habit) => habit.id))
      const habitsToAdd = importedHabits.filter((habit) => !existingIds.has(habit.id))

      habitsStore.hydrate([...habitsToAdd, ...existingHabits])
      persistCurrentState()

      toast.add({
        title: 'Habits imported',
        description: `${habitsToAdd.length} new habit${habitsToAdd.length === 1 ? '' : 's'} added. History was ignored.`,
        color: 'success'
      })
    } else {
      const parsed = parseAppData(payload)

      habitsStore.hydrate(parsed.habits)
      entriesStore.hydrate(parsed.entries)
      coachStore.hydrate(parsed.suggestions)
      settingsStore.hydrate(parsed.settings)
      entriesStore.ensureMissedEntries(habitsStore.activeHabits, todayDateKey())
      coachStore.reconcileMissingSuggestions(habitsStore.activeHabits, entriesStore.entries)

      persistence.save({
        ...parsed,
        entries: entriesStore.snapshot(),
        suggestions: coachStore.snapshot()
      })

      syncDailyReviewTimeFromSettings()

      toast.add({
        title: 'Import complete',
        description: 'Backup data has been restored.',
        color: 'success'
      })
    }

    importModalOpen.value = false
  } catch {
    toast.add({
      title: 'Import failed',
      description: importHabitsOnly.value
        ? 'The file is not valid JSON with importable habits.'
        : 'The file is not valid AppDataV1 JSON.',
      color: 'error'
    })
  }
}

function deleteAllData(withBackup: boolean): void {
  if (withBackup) {
    downloadBackup(buildCurrentPayload())
  }

  const empty = createEmptyAppData()
  habitsStore.hydrate(empty.habits)
  entriesStore.hydrate(empty.entries)
  coachStore.hydrate(empty.suggestions)
  settingsStore.hydrate(empty.settings)
  syncDailyReviewTimeFromSettings()
  persistence.save(empty)
  notificationPermission.value = reminderEngine.currentPermission()
  deleteAllModalOpen.value = false

  toast.add({
    title: withBackup ? 'Backup downloaded and data deleted' : 'All data deleted',
    color: 'warning'
  })
}
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <div class="space-y-1">
            <h1 class="text-2xl font-semibold">Settings</h1>
            <p class="text-sm text-muted">
              Manage reminders, personalize the experience, and keep your data safe.
            </p>
          </div>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-bell-ring" class="size-5 text-muted" />
            <h2 class="text-lg font-semibold">Notifications</h2>
          </div>
        </template>

        <div class="space-y-4">
          <UAlert
            :color="notificationPermissionIndicator.color"
            variant="soft"
            :icon="notificationPermissionIndicator.icon"
            :title="`Notification permission ${notificationPermissionLabel}`"
          />

          <UCheckbox
            v-model="notificationEnabled"
            label="Enable local notifications"
            description="Notifications fire when the browser/PWA allows local scheduling."
          />
          <UButton color="neutral" variant="outline" icon="i-lucide-bell-ring" @click="requestPermission">
            Request notification permission
          </UButton>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sliders-horizontal" class="size-5 text-muted" />
            <h2 class="text-lg font-semibold">Preferences</h2>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Daily review reminder">
            <UInputTime v-model="dailyReviewTime" :hour-cycle="24" icon="i-lucide-clock-3" />
          </UFormField>
          <UFormField label="Week starts on">
            <USelect v-model="weekStartsOn" :items="weekStartsOnItems" value-key="value" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-palette" class="size-5 text-muted" />
            <h2 class="text-lg font-semibold">Theme</h2>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Theme mode" help="Default is System. You can switch to Light or Dark anytime.">
            <ClientOnly>
              <UColorModeSelect class="w-full" color="neutral" />
              <template #fallback>
                <UButton color="neutral" variant="outline" class="w-full justify-start" disabled>
                  Theme mode
                </UButton>
              </template>
            </ClientOnly>
          </UFormField>
          <UFormField label="Accent color">
            <USelect v-model="primaryColor" :items="primaryColorItems" value-key="value" class="w-full">
              <template #leading="{ modelValue, ui }">
                <UChip
                  v-if="modelValue"
                  inset
                  standalone
                  v-bind="getPrimaryColorChip(modelValue as string)"
                  :size="(ui.itemLeadingChipSize() as ChipProps['size'])"
                  :class="ui.itemLeadingChip()"
                />
              </template>
            </USelect>
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-muted" />
            <h2 class="text-lg font-semibold">Backup and restore</h2>
          </div>
        </template>

        <div class="flex flex-wrap items-center gap-3">
          <UButton icon="i-lucide-download" @click="exportJson">
            Export JSON
          </UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-upload" @click="importModalOpen = true">
            Import JSON
          </UButton>
          <UButton color="error" variant="outline" icon="i-lucide-trash-2" @click="deleteAllModalOpen = true">
            Delete all data
          </UButton>
        </div>
      </UCard>
    </div>

    <UModal
      :open="importModalOpen"
      title="Import JSON"
      description="Select a backup file and choose how data should be restored."
      @update:open="importModalOpen = $event"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Backup file" required>
            <input
              type="file"
              accept="application/json"
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
              @change="onImportFileSelected"
            >
          </UFormField>

          <UCheckbox
            v-model="importHabitsOnly"
            label="Import habits only"
            description="Adds only habits from the file and ignores imported entries, coaching history, and settings."
          />

          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-circle-help"
            :description="
              importHabitsOnly
                ? 'Use this for AI-generated starter lists or habit templates.'
                : 'Full import replaces your current habits, history, coaching data, and settings.'
            "
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="importModalOpen = false">
            Cancel
          </UButton>
          <UButton icon="i-lucide-upload" @click="confirmImport">
            Import
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="deleteAllModalOpen"
      title="Delete all data"
      description="This removes all habits, history, coaching suggestions, and settings from this device."
      @update:open="deleteAllModalOpen = $event"
    >
      <template #body>
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="This action cannot be undone"
          description="If you might need this data later, download a backup before deleting."
        />
      </template>

      <template #footer>
        <div class="flex w-full flex-col gap-2">
          <div class="flex justify-end">
            <UButton color="neutral" variant="ghost" @click="deleteAllModalOpen = false">
              Cancel
            </UButton>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton color="error" icon="i-lucide-download" @click="deleteAllData(true)">
              Download backup and delete all
            </UButton>
            <UButton color="error" variant="outline" icon="i-lucide-trash-2" @click="deleteAllData(false)">
              Delete all
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UPage>
</template>

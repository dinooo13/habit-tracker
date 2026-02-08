<script setup lang="ts">
import { Time } from '@internationalized/date'
import { parseAppData } from '~/utils/storage-schema'
import { formatTimeString, parseTimeString, todayDateKey } from '~/utils/date'

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

function exportJson(): void {
  const payload = {
    schemaVersion: 1,
    habits: habitsStore.snapshot(),
    entries: entriesStore.snapshot(),
    suggestions: coachStore.snapshot(),
    settings: settingsStore.snapshot()
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `habit-tracker-${todayDateKey()}.json`
  anchor.click()
  URL.revokeObjectURL(url)

  toast.add({ title: 'Export complete', color: 'success' })
}

async function importJson(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const parsed = parseAppData(JSON.parse(text))

    habitsStore.hydrate(parsed.habits)
    entriesStore.hydrate(parsed.entries)
    coachStore.hydrate(parsed.suggestions)
    settingsStore.hydrate(parsed.settings)
    entriesStore.ensureMissedEntries(habitsStore.activeHabits, todayDateKey())

    persistence.save(parsed)

    const parsedTime = parseTimeString(settingsStore.dailyReviewTime)
    dailyReviewTime.value = parsedTime ? new Time(parsedTime.hour, parsedTime.minute, 0) : null

    toast.add({
      title: 'Import complete',
      description: 'Backup data has been restored.',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Import failed',
      description: 'The file is not valid AppDataV1 JSON.',
      color: 'error'
    })
  } finally {
    target.value = ''
  }
}
</script>

<template>
  <UPage>
    <div class="space-y-6">
      <UCard>
        <template #header>
          <h1 class="text-2xl font-semibold">Settings</h1>
        </template>

        <div class="space-y-4">
          <UAlert
            color="neutral"
            variant="outline"
            icon="i-lucide-bell"
            :title="`Notification permission: ${notificationPermission}`"
            description="Without backend push, reminders are best-effort in browser/PWA contexts."
          />

          <div class="grid gap-4 md:grid-cols-2">
            <UCard variant="outline">
              <div class="space-y-3">
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

            <UCard variant="outline">
              <div class="space-y-3">
                <UFormField label="Daily review reminder">
                  <UInputTime v-model="dailyReviewTime" :hour-cycle="24" icon="i-lucide-clock-3" />
                </UFormField>
                <UFormField label="Week starts on">
                  <USelect v-model="weekStartsOn" :items="weekStartsOnItems" value-key="value" class="w-full" />
                </UFormField>
              </div>
            </UCard>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Backup and restore</h2>
        </template>

        <div class="flex flex-wrap items-center gap-3">
          <UButton icon="i-lucide-download" @click="exportJson">
            Export JSON
          </UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-upload">
            <label class="cursor-pointer">
              Import JSON
              <input class="hidden" type="file" accept="application/json" @change="importJson" />
            </label>
          </UButton>
        </div>
      </UCard>
    </div>
  </UPage>
</template>

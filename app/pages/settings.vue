<script setup lang="ts">
import { Time } from '@internationalized/date'
import type { ChipProps, SelectItem } from '@nuxt/ui'
import type { PrimaryColor } from '~/types/app-data'
import { parseAppData } from '~/utils/storage-schema'
import { formatTimeString, parseTimeString, todayDateKey } from '~/utils/date'
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
            :color="notificationPermissionIndicator.color"
            variant="soft"
            :icon="notificationPermissionIndicator.icon"
            :title="`Notification permission ${notificationPermissionLabel}`"
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

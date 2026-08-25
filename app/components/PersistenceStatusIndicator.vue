<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { nowIso, shortRelativeTime, todayDateKey } from '~/utils/domain/date'
import { downloadBackup } from '~/utils/persistence/export-backup'

// Refresh the relative "Saved · Xm ago" label on a slow tick so it stays roughly
// current without re-rendering constantly. Client-only (ssr: false).
const RELATIVE_REFRESH_MS = 30_000

// Auto-dismiss the quiet "Saved · …" pill this long after a save settles to `ok`,
// so the happy path leaves no lingering chrome. Any fresh save activity or a
// non-ok status cancels the timer and brings the pill back (see the status watch).
const SUCCESS_AUTOHIDE_MS = 10_000

const storageHealth = useStorageHealth()
const lifecycle = useAppDataLifecycle()
const backupNudge = useBackupNudge()
const { logSecurityEvent } = useSecurityLog()
const toast = useToast()

const now = ref(nowIso())
let clockTimer: ReturnType<typeof setInterval> | null = null

// True once the success pill has auto-hidden after settling on `ok`. Reset on any
// fresh save activity or non-ok status so the pill reappears when there's news.
const successHidden = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

onMounted(() => {
  if (import.meta.client) {
    clockTimer = setInterval(() => {
      now.value = nowIso()
    }, RELATIVE_REFRESH_MS)
  }
})

onBeforeUnmount(() => {
  if (clockTimer !== null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  clearHideTimer()
})

const status = computed(() => storageHealth.status.value)
const isUnavailable = computed(() => status.value === 'unavailable')

// Whenever the status settles on `ok` (or a fresh save stamps a new lastSavedAt),
// show the pill and schedule it to fade after SUCCESS_AUTOHIDE_MS. Leaving `ok`
// — saving, retrying, unavailable — cancels the timer and keeps the pill visible.
watch(
  [status, () => storageHealth.lastSavedAt.value],
  ([currentStatus]) => {
    clearHideTimer()
    successHidden.value = false
    if (currentStatus === 'ok' && import.meta.client) {
      hideTimer = setTimeout(() => {
        successHidden.value = true
      }, SUCCESS_AUTOHIDE_MS)
    }
  },
  { immediate: true },
)

const savedLabel = computed(() => {
  const iso = storageHealth.lastSavedAt.value
  if (!iso) {
    return ''
  }
  return shortRelativeTime(iso, new Date(now.value))
})

// Quiet by design: show nothing in the header until there is something worth
// saying, and never a distracting "Saving…" flash on the happy path — a save in
// flight keeps showing the previous "Saved · …" label.
const pill = computed<{ text: string, tone: 'ok' | 'warn' } | null>(() => {
  if (status.value === 'failed') {
    return { text: 'Retrying…', tone: 'warn' }
  }
  if (isUnavailable.value) {
    // The banner carries the message; keep the header pill silent.
    return null
  }
  if (savedLabel.value && !successHidden.value) {
    return { text: `Saved · ${savedLabel.value}`, tone: 'ok' }
  }
  return null
})

const dotClass = computed(() =>
  pill.value?.tone === 'warn' ? 'bg-warning' : 'bg-success',
)

function exportBackup(): void {
  const payload = lifecycle.snapshotAppData()
  downloadBackup(payload, todayDateKey())
  logSecurityEvent('data.export', 'info', `${payload.habits.length} habits exported (recovery)`)
  backupNudge.markExported()
  toast.add({ title: 'Backup exported', color: 'success' })
}

function retryNow(): void {
  storageHealth.requestRetry()
}
</script>

<template>
  <div>
    <UAlert
      v-if="isUnavailable"
      color="error"
      variant="subtle"
      icon="i-lucide-database-backup"
      class="rounded-none"
      title="Your changes aren't being saved to this device."
      description="Export a backup so you don't lose them, then retry."
      :actions="[
        { label: 'Export backup', color: 'error', variant: 'solid', onClick: exportBackup },
        { label: 'Retry now', color: 'neutral', variant: 'ghost', onClick: retryNow },
      ]"
    />

    <div
      v-if="pill"
      class="flex justify-end px-4 py-1 text-xs text-muted"
      aria-live="polite"
    >
      <span class="inline-flex items-center gap-1.5">
        <span
          class="inline-block size-1.5 rounded-full"
          :class="dotClass"
        />
        {{ pill.text }}
      </span>
    </div>
  </div>
</template>

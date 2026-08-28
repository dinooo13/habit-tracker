<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { shortRelativeTime } from '~/utils/domain/date'
import { formatBytes } from '~/utils/observability/storage-health'
import type { SecurityEvent, SecurityEventLevel } from '~/utils/observability/security-log'

// Session-diagnostic panel (issue #73): surfaces the storage-health state the app
// already computes but never showed — storage estimate, persistent-storage grant,
// last-save time, boot/rollover reconcile counts, and the SEC-16 event log. All
// read-only and in-memory; nothing here is persisted.

// Newest-first cap for the event list — enough for a session glance without
// rendering the whole 200-entry ring buffer.
const EVENT_DISPLAY_LIMIT = 25

const storageHealth = useStorageHealth()
const { recentEvents } = useSecurityLog()

const status = computed(() => storageHealth.status.value)
const estimate = computed(() => storageHealth.estimate.value)
const persisted = computed(() => storageHealth.persisted.value)
const lastReconcile = computed(() => storageHealth.lastReconcile.value)

const statusMeta = computed(() => {
  switch (status.value) {
    case 'saving':
      return { label: 'Saving…', dot: 'bg-neutral-400' }
    case 'failed':
      return { label: 'Retrying', dot: 'bg-warning' }
    case 'unavailable':
      return { label: 'Unavailable', dot: 'bg-error' }
    default:
      return { label: 'OK', dot: 'bg-success' }
  }
})

const savedLabel = computed(() => shortRelativeTime(storageHealth.lastSavedAt.value))

const persistedLabel = computed(() => {
  if (persisted.value === true) {
    return 'Granted'
  }
  if (persisted.value === false) {
    return 'Best-effort (may be evicted)'
  }
  return 'Unknown'
})

// Guard `quota === 0` (unknown/unbounded) so we never divide by zero.
const usagePercent = computed(() => {
  const value = estimate.value
  if (!value || value.quota <= 0) {
    return null
  }
  return Math.round((value.usage / value.quota) * 100)
})

const usageLabel = computed(() => {
  const value = estimate.value
  if (!value) {
    return null
  }
  if (value.quota <= 0) {
    return formatBytes(value.usage)
  }
  return `${formatBytes(value.usage)} of ${formatBytes(value.quota)}`
})

const reconcileLabel = computed(() => {
  const summary = lastReconcile.value
  if (!summary) {
    return null
  }
  if (summary.missedEntriesCreated === 0 && summary.suggestionsCreated === 0) {
    return 'No changes on last check'
  }
  const parts: string[] = []
  if (summary.missedEntriesCreated > 0) {
    parts.push(`${summary.missedEntriesCreated} missed backfilled`)
  }
  if (summary.suggestionsCreated > 0) {
    parts.push(`${summary.suggestionsCreated} suggestions generated`)
  }
  return parts.join(' · ')
})

// The SEC-16 log is framework-free by design (no reactivity), so we pull a plain
// snapshot on mount and re-pull on demand via the Refresh button.
const events = ref<SecurityEvent[]>([])

function refreshEvents(): void {
  events.value = [...recentEvents()].reverse().slice(0, EVENT_DISPLAY_LIMIT)
}

onMounted(refreshEvents)

function eventBadgeColor(level: SecurityEventLevel): 'neutral' | 'warning' | 'error' {
  if (level === 'warn') {
    return 'warning'
  }
  if (level === 'error') {
    return 'error'
  }
  return 'neutral'
}

function eventTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) {
    return ts
  }
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
</script>

<template>
  <UCard id="persistence-health">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-activity"
          class="size-5 text-muted"
        />
        <h2 class="text-lg font-semibold">
          Storage &amp; diagnostics
        </h2>
      </div>
    </template>

    <div class="space-y-5 text-sm">
      <!-- Persistence status -->
      <div class="flex items-center justify-between gap-3">
        <span class="text-muted">Persistence status</span>
        <span class="inline-flex items-center gap-2 font-medium">
          <span
            class="inline-block size-2 rounded-full"
            :class="statusMeta.dot"
          />
          <span>{{ statusMeta.label }}</span>
          <span
            v-if="savedLabel"
            class="text-muted font-normal"
          >· Saved {{ savedLabel }}</span>
        </span>
      </div>

      <!-- Persistent storage grant -->
      <div class="flex items-center justify-between gap-3">
        <span class="text-muted">Persistent storage</span>
        <span class="font-medium">{{ persistedLabel }}</span>
      </div>

      <!-- Storage usage -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3">
          <span class="text-muted">Storage used</span>
          <span
            v-if="usagePercent !== null"
            class="font-medium"
          >{{ usagePercent }}%</span>
          <span
            v-else
            class="font-medium text-muted"
          >Not available</span>
        </div>
        <template v-if="usagePercent !== null">
          <UProgress :model-value="usagePercent" />
          <p class="text-xs text-muted">
            {{ usageLabel }}
          </p>
        </template>
      </div>

      <!-- Last reconcile -->
      <div
        v-if="reconcileLabel"
        class="flex items-start justify-between gap-3"
      >
        <span class="text-muted whitespace-nowrap">Last reconcile</span>
        <span class="font-medium text-right">{{ reconcileLabel }}</span>
      </div>

      <!-- Recent activity -->
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-muted">Recent activity</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            @click="refreshEvents"
          >
            Refresh
          </UButton>
        </div>

        <ul
          v-if="events.length > 0"
          class="divide-y divide-default rounded-md border border-default"
        >
          <li
            v-for="(event, index) in events"
            :key="`${event.ts}-${index}`"
            class="flex items-center gap-2 px-3 py-2"
          >
            <span class="font-mono text-xs text-muted whitespace-nowrap">{{ eventTime(event.ts) }}</span>
            <UBadge
              :color="eventBadgeColor(event.level)"
              variant="subtle"
              size="sm"
            >
              {{ event.level }}
            </UBadge>
            <span class="font-medium whitespace-nowrap">{{ event.type }}</span>
            <span
              v-if="event.detail"
              class="text-muted truncate"
            >— {{ event.detail }}</span>
          </li>
        </ul>
        <p
          v-else
          class="text-muted"
        >
          No events yet this session.
        </p>

        <p class="text-xs text-muted">
          Session-only — clears on reload.
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import type { PrimaryNavItem } from '~/types/navigation'

const route = useRoute()
const router = useRouter()
const dummyAuth = useDummyAuth()

dummyAuth.initFromStorage()

// SEC-14: prompt before applying a downloaded service-worker update.
const pwaUpdate = usePwaUpdate()

// SEC-18: surface storage write failures / low-quota warnings as toasts.
const storageHealth = useStorageHealth()
const toast = useToast()

watch(storageHealth.lastError, (message) => {
  if (!message) {
    return
  }

  toast.add({
    title: 'Could not save your changes',
    description: message,
    color: 'error',
    icon: 'i-lucide-database-backup'
  })
})

watch(storageHealth.isQuotaLow, (low, wasLow) => {
  if (low && !wasLow) {
    toast.add({
      title: 'Storage is running low',
      description: 'Export a backup and remove old data to avoid losing changes.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert'
    })
  }
})

const primaryNavItems: PrimaryNavItem[] = [
  { label: 'Today', to: '/app', icon: 'i-lucide-layout-grid' },
  { label: 'Habits', to: '/app/habits', icon: 'i-lucide-list-checks' },
  { label: 'Review', to: '/app/review', icon: 'i-lucide-clipboard-check' },
  { label: 'Insights', to: '/app/insights', icon: 'i-lucide-chart-line' },
  { label: 'Settings', to: '/app/settings', icon: 'i-lucide-settings' }
]

function isActivePath(path: string): boolean {
  return path === '/app' ? route.path === path : route.path.startsWith(path)
}

async function handleLogout(): Promise<void> {
  dummyAuth.logout()
  await router.push('/')
}
</script>

<template>
  <div>
    <UAlert
      v-if="pwaUpdate.needRefresh.value"
      color="primary"
      variant="subtle"
      icon="i-lucide-download"
      title="A new version is available."
      description="Reload to update the app to the latest version."
      class="rounded-none"
      :actions="[
        { label: 'Reload', color: 'primary', variant: 'solid', onClick: () => pwaUpdate.reload() },
        { label: 'Later', color: 'neutral', variant: 'ghost', onClick: () => pwaUpdate.dismiss() }
      ]"
    />

    <header class="sticky top-0 z-40 border-b border-default/60 bg-default/70 shadow-sm backdrop-blur-xl">
      <UContainer class="flex flex-wrap items-center justify-between gap-3 py-3">
        <NuxtLink class="flex items-center gap-2 text-base font-semibold tracking-tight text-primary" to="/app">
          <BrandLogo class="size-7 shrink-0" />
          <span>Atomic Habit Tracker</span>
        </NuxtLink>

        <UButton
          class="md:hidden"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-log-out"
          aria-label="Logout"
          @click="handleLogout"
        />

        <div class="hidden flex-wrap items-center gap-2 md:flex">
          <UButton
            v-for="item in primaryNavItems"
            :key="item.to"
            :to="item.to"
            :variant="isActivePath(item.to) ? 'solid' : 'ghost'"
            :color="isActivePath(item.to) ? 'primary' : 'neutral'"
            size="sm"
          >
            {{ item.label }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-log-out"
            @click="handleLogout"
          >
            Logout
          </UButton>
        </div>
      </UContainer>
    </header>

    <UMain>
      <UContainer class="py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-6">
        <slot />
      </UContainer>
    </UMain>

    <MobileBottomNav :items="primaryNavItems" />
  </div>
</template>

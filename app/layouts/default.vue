<script setup lang="ts">
import type { PrimaryNavItem } from '~/types/navigation'

const route = useRoute()

const primaryNavItems: PrimaryNavItem[] = [
  { label: 'Today', to: '/', icon: 'i-lucide-layout-grid' },
  { label: 'Habits', to: '/habits', icon: 'i-lucide-list-checks' },
  { label: 'Review', to: '/review', icon: 'i-lucide-clipboard-check' },
  { label: 'Insights', to: '/insights', icon: 'i-lucide-chart-line' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

function isActivePath(path: string): boolean {
  return path === '/' ? route.path === path : route.path.startsWith(path)
}
</script>

<template>
  <div>
    <header class="sticky top-0 z-40 border-b border-default/60 bg-default/70 shadow-sm backdrop-blur-xl">
      <UContainer class="flex flex-wrap items-center justify-between gap-3 py-3">
        <NuxtLink class="text-base font-semibold tracking-tight md:text-primary" to="/">
          Atomic Habit Tracker
        </NuxtLink>

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
        </div>
      </UContainer>
    </header>

    <UMain>
      <UContainer class="py-6 pb-28 md:pb-6">
        <slot />
      </UContainer>
    </UMain>

    <MobileBottomNav :items="primaryNavItems" />
  </div>
</template>

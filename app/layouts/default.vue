<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PrimaryNavItem } from '~/types/navigation'

const route = useRoute()

const primaryNavItems: PrimaryNavItem[] = [
  { label: 'Today', to: '/', icon: 'i-lucide-layout-grid' },
  { label: 'Habits', to: '/habits', icon: 'i-lucide-list-checks' },
  { label: 'Review', to: '/review', icon: 'i-lucide-clipboard-check' },
  { label: 'Insights', to: '/insights', icon: 'i-lucide-chart-line' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

const quickMenu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Create habit', icon: 'i-lucide-plus', to: '/habits/new' },
    { label: 'Review missed habits', icon: 'i-lucide-clipboard-check', to: '/review' }
  ],
  [{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }]
])

function isActivePath(path: string): boolean {
  return path === '/' ? route.path === path : route.path.startsWith(path)
}
</script>

<template>
  <div>
    <header class="sticky top-0 z-40 border-b border-default/70 bg-default/80 backdrop-blur">
      <UContainer class="flex flex-wrap items-center justify-between gap-3 py-3">
        <NuxtLink class="text-base font-semibold tracking-tight" to="/">
          Atomic Habit Tracker
        </NuxtLink>

        <div class="hidden flex-wrap items-center gap-2 md:flex">
          <UButton
            v-for="item in primaryNavItems"
            :key="item.to"
            :to="item.to"
            :variant="isActivePath(item.to) ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
          >
            {{ item.label }}
          </UButton>

          <UTooltip text="Quick actions">
            <UDropdownMenu :items="quickMenu">
              <UButton icon="i-lucide-menu" color="neutral" variant="outline" size="sm" />
            </UDropdownMenu>
          </UTooltip>
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

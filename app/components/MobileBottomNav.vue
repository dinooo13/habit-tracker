<script setup lang="ts">
import type { PrimaryNavItem } from '~/types/navigation'

const props = defineProps<{
  items: PrimaryNavItem[]
}>()

const route = useRoute()

function isActivePath(path: string): boolean {
  return path === '/' ? route.path === path : route.path.startsWith(path)
}
</script>

<template>
  <nav
    aria-label="Primary navigation"
    class="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:hidden"
  >
    <div
      class="mx-auto w-full max-w-md overflow-hidden rounded-full border border-default/80 bg-default/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur"
    >
      <ul class="grid grid-cols-5 gap-1">
        <li v-for="item in props.items" :key="item.to">
          <ULink
            :to="item.to"
            :aria-current="isActivePath(item.to) ? 'page' : undefined"
            class="flex h-12 flex-col items-center justify-center rounded-full px-1 text-[11px] font-medium transition-colors"
            :class="
              isActivePath(item.to)
                ? 'bg-primary text-inverted'
                : 'text-muted hover:bg-elevated hover:text-default'
            "
          >
            <UIcon :name="item.icon" class="mb-0.5 size-4" />
            <span class="truncate">{{ item.label }}</span>
          </ULink>
        </li>
      </ul>
    </div>
  </nav>
</template>

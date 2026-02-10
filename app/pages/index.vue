<script setup lang="ts">
import { resolveRedirectTarget } from '~/utils/dummy-auth'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const dummyAuth = useDummyAuth()
const demoData = useDemoData()

const replaceDemoDataModalOpen = ref(false)

dummyAuth.initFromStorage()

const primaryActionLabel = computed(() =>
  dummyAuth.isLoggedIn.value ? 'Open app' : 'Login'
)

const redirectTarget = computed(() => resolveRedirectTarget(route.query.redirect, '/app'))

const featurePreviews = [
  {
    title: 'Today queue',
    subtitle: 'Plan and execute',
    description:
      'Start each day with a focused queue. Mark habits done, skipped, or missed, and keep momentum with visible streak context.',
    bullets: [
      'Daily progress bar across all due habits',
      'Fast status actions directly in the queue',
      'Streak chips for active habits'
    ],
    screenshot: '/screenshots/mobile-today.png',
    alt: 'Mobile screenshot of the today queue page',
    to: '/app',
    cta: 'Open Today',
    icon: 'i-lucide-layout-grid'
  },
  {
    title: 'Review flow',
    subtitle: 'Learn from misses',
    description:
      'When habits slip, capture the reason and turn it into concrete guidance so misses become useful feedback instead of noise.',
    bullets: [
      'Pending reflection list grouped by habit',
      'Structured miss-reason capture workflow',
      'Actionable coaching suggestions generated from reflections'
    ],
    screenshot: '/screenshots/mobile-review.png',
    alt: 'Mobile screenshot of the review page',
    to: '/app/review',
    cta: 'Open Review',
    icon: 'i-lucide-clipboard-check'
  },
  {
    title: 'Insights',
    subtitle: 'Track what works',
    description:
      'Analyze completion trends, performance by habit, and miss patterns to decide exactly what to improve next.',
    bullets: [
      'Completion trend visualization by time window',
      'Habit-level completion and streak comparisons',
      'Miss reason distribution to spot recurring friction'
    ],
    screenshot: '/screenshots/mobile-insights.png',
    alt: 'Mobile screenshot of the insights page',
    to: '/app/insights',
    cta: 'Open Insights',
    icon: 'i-lucide-chart-line'
  }
] as const

async function handlePrimaryAction(): Promise<void> {
  dummyAuth.initFromStorage()

  if (!dummyAuth.isLoggedIn.value) {
    dummyAuth.login()
  }

  await router.push(redirectTarget.value)
}

async function loadDemoData(replaceExisting: boolean): Promise<void> {
  try {
    const result = await demoData.loadDemoData({ replaceExisting })

    if (!result.loaded && result.reason === 'existing-data') {
      replaceDemoDataModalOpen.value = true
      return
    }

    replaceDemoDataModalOpen.value = false

    toast.add({
      title: 'Demo data loaded',
      description: 'Fixture habits and history are now available in the app.',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Demo data failed',
      description: 'Could not load the fixture JSON. Please try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <div>
    <section class="relative overflow-hidden border-b border-default/70">
      <div class="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" aria-hidden="true" />
      <UContainer class="relative py-14 md:py-20">
        <div class="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div class="space-y-6">
            <UBadge color="primary" variant="soft" class="rounded-full px-3 py-1">
              Atomic Habit Tracker
            </UBadge>
            <div class="space-y-4">
              <h1 class="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Build better routines with a clear daily system.
              </h1>
              <p class="max-w-xl text-pretty text-base text-muted md:text-lg">
                Plan identity-based habits, review misses with coaching, and track progress trends in a focused mobile-first workflow.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <UButton size="xl" icon="i-lucide-log-in" @click="handlePrimaryAction">
                {{ primaryActionLabel }}
              </UButton>
              <UButton
                size="xl"
                color="neutral"
                variant="outline"
                icon="i-lucide-database"
                :loading="demoData.isLoading.value"
                @click="loadDemoData(false)"
              >
                Load demo data
              </UButton>
            </div>
          </div>

          <UCard class="md:max-w-sm md:justify-self-end" variant="outline">
            <template #header>
              <div class="space-y-1">
                <p class="text-sm font-medium text-muted">What you get</p>
                <h2 class="text-xl font-semibold">All core habit loops</h2>
              </div>
            </template>

            <ul class="space-y-3 text-sm text-muted">
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-success" />
                <span>Daily queue for done, missed, and skipped outcomes.</span>
              </li>
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-success" />
                <span>Build and break habits with reminders and schedules.</span>
              </li>
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-success" />
                <span>Reflection flow with Atomic Habits coaching suggestions.</span>
              </li>
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-success" />
                <span>Insights, streak tracking, and JSON backup/restore.</span>
              </li>
            </ul>
          </UCard>
        </div>
      </UContainer>
    </section>

    <section class="border-b border-default/70">
      <UContainer class="py-12 md:py-16">
        <div class="space-y-2">
          <h2 class="text-2xl font-semibold tracking-tight md:text-3xl">See each workflow in action</h2>
          <p class="text-sm text-muted">Real mobile captures, each paired with what the screen is designed to help you do.</p>
        </div>

        <div class="mt-8 space-y-6 md:space-y-8">
          <article
            v-for="(preview, index) in featurePreviews"
            :key="preview.title"
            class="rounded-2xl border border-default/70 bg-default/40 p-5 shadow-sm md:p-7"
          >
            <div class="grid items-center gap-6 md:grid-cols-2">
              <div :class="index % 2 === 1 ? 'space-y-4 md:order-2' : 'space-y-4'">
                <UBadge color="neutral" variant="soft" class="rounded-full px-3 py-1">
                  <UIcon :name="preview.icon" class="mr-1 size-3.5" />
                  {{ preview.subtitle }}
                </UBadge>
                <h3 class="text-xl font-semibold tracking-tight md:text-2xl">
                  {{ preview.title }}
                </h3>
                <p class="text-sm text-muted md:text-base">
                  {{ preview.description }}
                </p>

                <ul class="space-y-2 text-sm text-muted">
                  <li v-for="bullet in preview.bullets" :key="bullet" class="flex items-start gap-2">
                    <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-primary" />
                    <span>{{ bullet }}</span>
                  </li>
                </ul>

                <UButton color="primary" variant="outline" :to="preview.to">
                  {{ preview.cta }}
                </UButton>
              </div>

              <div :class="index % 2 === 1 ? 'mx-auto md:order-1' : 'mx-auto'">
                <div class="relative w-[292px] overflow-hidden rounded-[2.6rem] border border-black/70 bg-black p-2.5 pt-8 shadow-2xl shadow-black/20">
                  <div class="pointer-events-none absolute inset-2.5 rounded-[1.9rem] bg-white" />
                  <div
                    class="pointer-events-none absolute left-1/2 top-4 z-10 flex h-6 w-28 -translate-x-1/2 items-center justify-end rounded-full border border-zinc-700 bg-zinc-900 px-2"
                  >
                    <span class="size-1.5 rounded-full bg-zinc-500" />
                  </div>
                  <img
                    :src="preview.screenshot"
                    :alt="preview.alt"
                    class="relative z-20 mt-2 block w-full rounded-[1.8rem] bg-white"
                    loading="lazy"
                  >
                </div>
              </div>
            </div>
          </article>
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer class="py-10">
        <UCard class="border-primary/30 bg-primary/5">
          <div class="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div class="space-y-4">
              <div class="space-y-2">
                <UBadge color="primary" variant="soft" class="rounded-full px-3 py-1">
                  <UIcon name="i-lucide-sparkles" class="mr-1 size-3.5" />
                  AI integration
                </UBadge>
                <h2 class="text-2xl font-semibold tracking-tight">Start faster with ready-to-copy AI prompts</h2>
                <p class="text-sm text-muted md:text-base">
                  The app includes prebuilt prompts that help you generate a full habits JSON from scratch or refine your current habits with AI.
                </p>
              </div>

              <ul class="space-y-2 text-sm text-muted">
                <li class="flex items-start gap-2">
                  <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-primary" />
                  <span><strong>Getting started prompt:</strong> asks guided questions and outputs import-ready habits JSON.</span>
                </li>
                <li class="flex items-start gap-2">
                  <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 text-primary" />
                  <span><strong>Current habits prompt:</strong> uses your existing habits JSON so AI can suggest better wording and schedules.</span>
                </li>
              </ul>
            </div>

            <div class="rounded-xl border border-default/70 bg-default/70 p-4">
              <p class="text-sm font-medium">How it works</p>
              <ol class="mt-3 space-y-2 text-sm text-muted">
                <li>1. Open Settings in the app.</li>
                <li>2. Copy one of the AI habit prompts.</li>
                <li>3. Run it in your preferred AI tool.</li>
                <li>4. Import the generated JSON backup.</li>
              </ol>
              <UButton class="mt-4" color="primary" variant="outline" to="/app/settings">
                Open AI prompts in Settings
              </UButton>
            </div>
          </div>
        </UCard>
      </UContainer>
    </section>

    <section>
      <UContainer class="py-10">
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold">Ready to start?</h2>
              <p class="text-sm text-muted">Login with one click and open the full app.</p>
            </div>
            <UButton icon="i-lucide-arrow-right" @click="handlePrimaryAction">
              {{ primaryActionLabel }}
            </UButton>
          </div>
        </UCard>
      </UContainer>
    </section>

    <UModal
      :open="replaceDemoDataModalOpen"
      title="Replace existing data?"
      description="Loading the demo fixture now will overwrite current habits, entries, suggestions, and settings."
      @update:open="replaceDemoDataModalOpen = $event"
    >
      <template #body>
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="This replaces local app data"
          description="Use this only when you want a fresh demo state for screenshots or exploration."
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="replaceDemoDataModalOpen = false">
            Cancel
          </UButton>
          <UButton color="warning" :loading="demoData.isLoading.value" @click="loadDemoData(true)">
            Replace and load demo
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

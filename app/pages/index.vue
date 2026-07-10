<script setup lang="ts">
import { resolveRedirectTarget } from '~/utils/dummy-auth'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const colorMode = useColorMode()

const dummyAuth = useDummyAuth()
const demoData = useDemoData()

const replaceDemoDataModalOpen = ref(false)

dummyAuth.initFromStorage()

const primaryActionLabel = 'Go to app'
const redirectTarget = computed(() => resolveRedirectTarget(route.query.redirect, '/app'))

const heroSignals = [
  {
    title: 'Daily focus without friction',
    description: 'Done, missed, or skipped in a few taps from one queue.',
    icon: 'i-lucide-zap',
  },
  {
    title: 'Feedback that improves behavior',
    description: 'Missed habits become reflection + coaching opportunities.',
    icon: 'i-lucide-sparkles',
  },
  {
    title: 'Progress you can actually read',
    description: 'Completion trends, streaks, and miss patterns in one place.',
    icon: 'i-lucide-chart-line',
  },
  {
    title: 'Own your data',
    description: 'Local-first by default, with JSON backup and restore.',
    icon: 'i-lucide-database',
  },
] as const

const journeyStats = [
  {
    value: '1-minute',
    label: 'Daily check-in',
    detail: 'Fast queue actions keep consistency easy.',
    icon: 'i-lucide-timer',
    stripe: 'from-primary to-primary/70',
  },
  {
    value: '3 views',
    label: 'Execution loop',
    detail: 'Today, Review, and Insights work as one cycle.',
    icon: 'i-lucide-git-merge',
    stripe: 'from-primary to-primary/70',
  },
  {
    value: '100%',
    label: 'Portable data',
    detail: 'Export/import JSON anytime from settings.',
    icon: 'i-lucide-shield-check',
    stripe: 'from-success to-success/70',
  },
] as const

const featurePreviews = [
  {
    title: 'Today queue',
    subtitle: 'Plan and execute',
    description:
      'Start each day with a focused queue. Mark habits done, skipped, or missed, and keep momentum with visible streak context.',
    bullets: [
      'Daily progress bar across all due habits',
      'Fast status actions directly in the queue',
      'Streak chips for active habits',
    ],
    screenshotLight: '/screenshots/mobile-today.png',
    screenshotDark: '/screenshots/mobile-today-dark.png',
    alt: 'Mobile screenshot of the today queue page',
    to: '/app',
    icon: 'i-lucide-layout-grid',
    surfaceClass: 'from-primary/12 via-primary/6 to-transparent',
    ornamentClass: 'bg-primary/25',
  },
  {
    title: 'Review flow',
    subtitle: 'Learn from misses',
    description:
      'When habits slip, capture the reason and turn it into concrete guidance so misses become useful feedback instead of noise.',
    bullets: [
      'Pending reflection list grouped by habit',
      'Structured miss-reason capture workflow',
      'Actionable coaching suggestions generated from reflections',
    ],
    screenshotLight: '/screenshots/mobile-review.png',
    screenshotDark: '/screenshots/mobile-review-dark.png',
    alt: 'Mobile screenshot of the review page',
    to: '/app/review',
    icon: 'i-lucide-clipboard-check',
    surfaceClass: 'from-warning/12 via-warning/6 to-transparent',
    ornamentClass: 'bg-warning/25',
  },
  {
    title: 'Insights',
    subtitle: 'Track what works',
    description:
      'Analyze completion trends, performance by habit, and miss patterns to decide exactly what to improve next.',
    bullets: [
      'Completion trend visualization by time window',
      'Habit-level completion and streak comparisons',
      'Miss reason distribution to spot recurring friction',
    ],
    screenshotLight: '/screenshots/mobile-insights.png',
    screenshotDark: '/screenshots/mobile-insights-dark.png',
    alt: 'Mobile screenshot of the insights page',
    to: '/app/insights',
    icon: 'i-lucide-chart-line',
    surfaceClass: 'from-success/12 via-success/6 to-transparent',
    ornamentClass: 'bg-success/25',
  },
] as const

const isDarkMode = computed(() => colorMode.value === 'dark')

function loginEntryTo(path: string): string {
  if (dummyAuth.isLoggedIn.value) {
    return path
  }

  return `/login?redirect=${encodeURIComponent(path)}`
}

function previewScreenshot(preview: (typeof featurePreviews)[number]): string {
  return isDarkMode.value ? preview.screenshotDark : preview.screenshotLight
}

async function handlePrimaryAction(): Promise<void> {
  await router.push(loginEntryTo(redirectTarget.value))
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
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: 'Demo data failed',
      description: 'Could not load the fixture JSON. Please try again.',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="relative overflow-x-clip">
    <div
      class="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-28 top-[28rem] h-64 w-64 rounded-full bg-success/10 blur-3xl"
      aria-hidden="true"
    />

    <header class="sticky top-0 z-50 border-b border-default/70 bg-default/90 backdrop-blur supports-[backdrop-filter]:bg-default/75">
      <UContainer class="flex items-center justify-between gap-3 py-3">
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 text-primary hover:opacity-90"
        >
          <BrandLogo class="size-7 shrink-0" />
          <span class="text-base font-semibold tracking-tight">Atomic Habit Tracker</span>
        </NuxtLink>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :to="loginEntryTo('/app')"
        >
          Go to app
        </UButton>
      </UContainer>
    </header>

    <section class="relative border-b border-default/70">
      <UContainer class="relative py-14 md:py-20">
        <div class="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div class="space-y-6">
            <UBadge
              color="primary"
              variant="soft"
              class="rounded-full px-3 py-1"
            >
              Atomic Habit Tracker
            </UBadge>

            <div class="space-y-4">
              <h1 class="max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
                Build better routines with a clear daily system.
              </h1>
              <p class="max-w-2xl text-pretty text-base text-muted md:text-lg">
                A mobile-first habit experience that helps you execute daily, learn from misses, and steadily improve your behavior over time.
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <UButton
                size="xl"
                icon="i-lucide-log-in"
                @click="handlePrimaryAction"
              >
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

            <div class="grid gap-3 sm:grid-cols-2">
              <UCard
                v-for="signal in heroSignals"
                :key="signal.title"
                variant="outline"
                class="border-default/70 bg-default/70"
              >
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="signal.icon"
                      class="size-4 text-primary"
                    />
                    <p class="text-sm font-semibold leading-snug">
                      {{ signal.title }}
                    </p>
                  </div>
                  <p class="text-xs text-muted md:text-sm">
                    {{ signal.description }}
                  </p>
                </div>
              </UCard>
            </div>
          </div>

          <div class="mx-auto w-full max-w-[420px]">
            <UCard
              class="relative overflow-hidden border-default/70 bg-default/80 p-6 shadow-xl shadow-primary/10"
              variant="outline"
            >
              <div
                class="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-2xl"
                aria-hidden="true"
              />
              <div
                class="pointer-events-none absolute -bottom-16 -left-14 h-44 w-44 rounded-full bg-success/20 blur-2xl"
                aria-hidden="true"
              />

              <div class="relative z-10">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                  Preview
                </p>
                <h2 class="mt-2 text-2xl font-semibold tracking-tight">
                  The daily loop in your pocket
                </h2>
                <p class="mt-2 text-sm text-muted">
                  See habits due now, reflect on misses, and close the loop with insights in one connected mobile flow.
                </p>

                <div class="mt-6 flex justify-center">
                  <div class="relative w-[272px] overflow-hidden rounded-[2.6rem] border border-black bg-black p-2.5 pt-8 shadow-2xl shadow-black/20">
                    <div class="pointer-events-none absolute inset-2.5 rounded-[1.9rem] bg-[image:var(--app-bg-overlay),var(--app-bg)]" />
                    <div class="pointer-events-none absolute inset-2.5 rounded-[1.9rem] bg-default/70 backdrop-blur-xl" />
                    <div
                      class="pointer-events-none absolute left-1/2 top-4 z-10 flex h-6 w-28 -translate-x-1/2 items-center justify-end rounded-full bg-black px-2"
                    >
                      <span class="size-1.5 rounded-full bg-zinc-500" />
                    </div>
                    <img
                      :src="previewScreenshot(featurePreviews[0]!)"
                      alt="Mobile screenshot of the today queue page"
                      width="390"
                      height="844"
                      class="relative z-20 mt-2 block aspect-[390/844] w-full rounded-[1.8rem] object-cover"
                      loading="eager"
                      decoding="async"
                    >
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </section>

    <section class="relative border-b border-default/70">
      <UContainer class="py-12 md:py-14">
        <div class="mb-5 flex items-end justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Momentum snapshot
            </p>
            <h2 class="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
              A loop designed to keep you moving
            </h2>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <UCard
            v-for="stat in journeyStats"
            :key="stat.label"
            variant="outline"
            class="relative overflow-hidden border-default/70 bg-default/75"
          >
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r"
              :class="stat.stripe"
              aria-hidden="true"
            />
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-3xl font-semibold tracking-tight">
                  {{ stat.value }}
                </p>
                <p class="mt-1 text-sm font-medium">
                  {{ stat.label }}
                </p>
              </div>
              <div class="rounded-full border border-default/70 bg-default/80 p-2">
                <UIcon
                  :name="stat.icon"
                  class="size-4 text-primary"
                />
              </div>
            </div>
            <p class="mt-3 text-sm text-muted">
              {{ stat.detail }}
            </p>
          </UCard>
        </div>
      </UContainer>
    </section>

    <section class="relative border-b border-default/70">
      <UContainer class="py-12 md:py-16">
        <div class="space-y-2">
          <h2 class="text-2xl font-semibold tracking-tight md:text-3xl">
            See each workflow in action
          </h2>
          <p class="text-sm text-muted">
            Built as one loop: execute today, review misses, and use insights to adjust.
          </p>
        </div>

        <div class="mt-8 space-y-6 md:space-y-8">
          <article
            v-for="(preview, index) in featurePreviews"
            :key="preview.title"
            class="relative overflow-hidden rounded-3xl border border-default/70 bg-default/50 p-5 shadow-sm md:p-7"
          >
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-br"
              :class="preview.surfaceClass"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute -right-10 top-10 h-24 w-24 rounded-full blur-xl"
              :class="preview.ornamentClass"
              aria-hidden="true"
            />
            <p
              class="pointer-events-none absolute right-6 top-5 text-5xl font-semibold tracking-tight text-default/20"
              aria-hidden="true"
            >
              0{{ index + 1 }}
            </p>

            <div class="relative z-10 grid items-center gap-6 md:grid-cols-2">
              <div :class="index % 2 === 1 ? 'space-y-4 md:order-2' : 'space-y-4'">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    color="neutral"
                    variant="soft"
                    class="rounded-full px-3 py-1"
                  >
                    Step {{ index + 1 }}
                  </UBadge>
                  <UBadge
                    color="neutral"
                    variant="outline"
                    class="rounded-full px-3 py-1"
                  >
                    <UIcon
                      :name="preview.icon"
                      class="mr-1 size-3.5"
                    />
                    {{ preview.subtitle }}
                  </UBadge>
                </div>

                <h3 class="text-xl font-semibold tracking-tight md:text-2xl">
                  {{ preview.title }}
                </h3>
                <p class="text-sm text-muted md:text-base">
                  {{ preview.description }}
                </p>

                <ul class="space-y-2 text-sm text-muted">
                  <li
                    v-for="bullet in preview.bullets"
                    :key="bullet"
                    class="flex items-start gap-2"
                  >
                    <UIcon
                      name="i-lucide-check-circle-2"
                      class="mt-0.5 size-4 text-primary"
                    />
                    <span>{{ bullet }}</span>
                  </li>
                </ul>

                <UButton
                  color="primary"
                  variant="outline"
                  :to="loginEntryTo(preview.to)"
                >
                  Go to app
                </UButton>
              </div>

              <div :class="index % 2 === 1 ? 'mx-auto md:order-1' : 'mx-auto'">
                <div class="relative w-[292px] overflow-hidden rounded-[2.6rem] border border-black bg-black p-2.5 pt-8 shadow-2xl shadow-black/20">
                  <div class="pointer-events-none absolute inset-2.5 rounded-[1.9rem] bg-[image:var(--app-bg-overlay),var(--app-bg)]" />
                  <div class="pointer-events-none absolute inset-2.5 rounded-[1.9rem] bg-default/70 backdrop-blur-xl" />
                  <div
                    class="pointer-events-none absolute left-1/2 top-4 z-10 flex h-6 w-28 -translate-x-1/2 items-center justify-end rounded-full bg-black px-2"
                  >
                    <span class="size-1.5 rounded-full bg-zinc-500" />
                  </div>
                  <img
                    :src="previewScreenshot(preview)"
                    :alt="preview.alt"
                    class="relative z-20 mt-2 block h-auto w-full rounded-[1.8rem]"
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
                <UBadge
                  color="primary"
                  variant="soft"
                  class="rounded-full px-3 py-1"
                >
                  <UIcon
                    name="i-lucide-sparkles"
                    class="mr-1 size-3.5"
                  />
                  AI integration
                </UBadge>
                <h2 class="text-2xl font-semibold tracking-tight">
                  Start faster with ready-to-copy AI prompts
                </h2>
                <p class="text-sm text-muted md:text-base">
                  Use prompt templates to generate an import-ready starter JSON or optimize your existing habit setup with AI-assisted edits.
                </p>
              </div>

              <ul class="space-y-2 text-sm text-muted">
                <li class="flex items-start gap-2">
                  <UIcon
                    name="i-lucide-check-circle-2"
                    class="mt-0.5 size-4 text-primary"
                  />
                  <span><strong>Getting started prompt:</strong> guided questions that produce a complete habits JSON.</span>
                </li>
                <li class="flex items-start gap-2">
                  <UIcon
                    name="i-lucide-check-circle-2"
                    class="mt-0.5 size-4 text-primary"
                  />
                  <span><strong>Current habits prompt:</strong> reviews your current setup and suggests better wording/schedules.</span>
                </li>
              </ul>
            </div>

            <div class="rounded-xl border border-default/70 bg-default/80 p-4">
              <p class="text-sm font-medium">
                How it works
              </p>
              <ol class="mt-3 space-y-2 text-sm text-muted">
                <li>1. Open Settings in the app.</li>
                <li>2. Copy one of the AI prompts.</li>
                <li>3. Run it in your AI tool of choice.</li>
                <li>4. Import the generated JSON backup.</li>
              </ol>
              <UButton
                class="mt-4"
                color="primary"
                variant="outline"
                :to="loginEntryTo('/app/settings')"
              >
                Go to app prompts
              </UButton>
            </div>
          </div>
        </UCard>
      </UContainer>
    </section>

    <section>
      <UContainer class="pb-14 pt-4 md:pb-16">
        <UCard class="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-success/10">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-semibold tracking-tight">
                Ready to make habits stick?
              </h2>
              <p class="mt-1 text-sm text-muted md:text-base">
                Go to the app and start with demo data, or bring your own routine.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-arrow-right"
                @click="handlePrimaryAction"
              >
                {{ primaryActionLabel }}
              </UButton>
              <UButton
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
          <UButton
            color="neutral"
            variant="ghost"
            @click="replaceDemoDataModalOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="warning"
            :loading="demoData.isLoading.value"
            @click="loadDemoData(true)"
          >
            Replace and load demo
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

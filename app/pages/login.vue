<script setup lang="ts">
import { resolveRedirectTarget } from '~/utils/dummy-auth'

const route = useRoute()
const router = useRouter()

const dummyAuth = useDummyAuth()

dummyAuth.initFromStorage()

const redirectTarget = computed(() => resolveRedirectTarget(route.query.redirect, '/app'))

watchEffect(() => {
  if (dummyAuth.isLoggedIn.value) {
    void router.replace(redirectTarget.value)
  }
})

async function loginAndContinue(): Promise<void> {
  dummyAuth.login()
  await router.push(redirectTarget.value)
}
</script>

<template>
  <UContainer class="py-16 md:py-24">
    <div class="mx-auto max-w-md">
      <UCard
        class="relative overflow-hidden border-default/70 bg-default/85 p-6 shadow-xl shadow-primary/10"
        variant="outline"
      >
        <div
          class="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-2xl"
          aria-hidden="true"
        />

        <div class="relative z-10 space-y-6">
          <div class="space-y-2">
            <UBadge
              color="primary"
              variant="soft"
              class="rounded-full px-3 py-1"
            >
              Dummy login
            </UBadge>
            <h1 class="text-3xl font-semibold tracking-tight">
              Continue to Atomic Habit Tracker
            </h1>
            <p class="text-sm text-muted">
              This is a temporary login step for preview mode. One click takes you straight into the app.
            </p>
          </div>

          <div class="space-y-3">
            <UButton
              class="w-full justify-center"
              size="xl"
              color="neutral"
              variant="outline"
              icon="i-lucide-apple"
              disabled
            >
              Sign in with Apple
            </UButton>
            <UButton
              class="w-full justify-center"
              size="xl"
              color="neutral"
              variant="outline"
              icon="i-lucide-chrome"
              disabled
            >
              Sign in with Google
            </UButton>

            <div class="flex items-center gap-3 py-1 text-xs text-muted">
              <span class="h-px flex-1 bg-default/80" />
              <span>or</span>
              <span class="h-px flex-1 bg-default/80" />
            </div>

            <UButton
              class="w-full justify-center"
              size="xl"
              icon="i-lucide-log-in"
              @click="loginAndContinue"
            >
              Continue with demo login
            </UButton>
            <UButton
              class="w-full justify-center"
              color="neutral"
              variant="outline"
              to="/"
            >
              Back to landing
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>

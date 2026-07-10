import { defineConfig, devices } from '@playwright/test'

// E2E runs against a locally built-and-served copy of the app (see
// docs/e2e-testing.md). The preview build is hermetic and deterministic, tests
// the exact code on the branch, and serves under base '/' — sidestepping the
// '/pr-<n>/' base-path difference of the deployed preview.
const PORT = Number(process.env.E2E_PORT || 3000)
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const isCI = !!process.env.CI

// `E2E_WEB_SERVER=dev` swaps the preview build for the dev server, which is
// handy for fast local debugging (HMR, source maps) at the cost of fidelity.
const useDevServer = process.env.E2E_WEB_SERVER === 'dev'

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    // Already authenticated by default — most specs seed the dummy-auth flag via
    // an init script (see e2e/support/fixtures.ts). Login itself is tested
    // explicitly in auth.spec.ts.
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // One mobile viewport project to exercise MobileBottomNav.vue.
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: useDevServer ? 'npm run dev' : 'npm run build && npm run preview',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { NUXT_TELEMETRY_DISABLED: '1' },
  },
})

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

// Remote mode: `E2E_SKIP_WEB_SERVER=1` starts no local server, so Playwright
// drives whatever `E2E_BASE_URL` points at (e.g. the live production origin in
// the post-deploy `production-smoke` job — see docs/e2e-testing.md, ADR-0020).
const skipWebServer = !!process.env.E2E_SKIP_WEB_SERVER

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  // In remote mode (the post-deploy `production-smoke` job) also emit a JSON
  // report so the failure-issue step can name the failing tests in the issue body
  // (ADR-0020). The `outputFile` is required — without it the JSON reporter prints
  // the whole report to stdout and drowns the job log. Keep the html reporter in
  // the array (a CLI `--reporter` override would silently drop it).
  reporter: isCI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ...(skipWebServer
          ? [['json', { outputFile: 'production-smoke-results.json' }] as const]
          : []),
      ]
    : [['list']],
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

  webServer: skipWebServer
    ? undefined
    : {
        command: useDevServer ? 'npm run dev' : 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { NUXT_TELEMETRY_DISABLED: '1' },
      },
})

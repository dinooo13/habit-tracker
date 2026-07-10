import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Two Vitest projects run under one config (ADR-0012):
//   - `unit` — fast Node environment for framework-independent logic
//     (stores, utilities, schema, persistence). This is the existing suite.
//   - `nuxt`  — Nuxt runtime + happy-dom for rendered component/page tests that
//     depend on auto-imports, Nuxt UI, routing, or Nuxt-provided Pinia.
// `npm test` runs both so CI cannot omit rendered tests; `test:unit` / `test:nuxt`
// select one project for a faster inner loop. See docs/TESTING.md.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          // Keep the existing convention, but never collect the Nuxt-runtime
          // subtree here so no rendered test is discovered by both projects.
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/nuxt/**']
        },
        resolve: {
          alias: {
            '~': fileURLToPath(new URL('./app', import.meta.url))
          }
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environmentOptions: {
            nuxt: {
              // happy-dom is lighter than jsdom and sufficient for these
              // form/page tests; pin it so the DOM choice stays visible.
              domEnvironment: 'happy-dom'
            }
          }
        }
      })
    ]
  }
})

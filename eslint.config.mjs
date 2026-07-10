// Flat ESLint config for the repository. Composes the project-aware config the
// @nuxt/eslint module generates at `.nuxt/eslint.config.mjs` (run `nuxt prepare`
// / `npm install` to produce it). Formatting is handled by ESLint Stylistic,
// enabled via `eslint.config.stylistic` in `nuxt.config.ts`. See ADR-0013.
//
// Add narrow, documented overrides below only when a concrete lint finding
// requires it — no blanket source exclusions.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Unit (Vitest) and e2e (Playwright) tests deliberately construct mock
    // stores, malformed payloads, and mock storage. `any` casts and dynamic
    // `delete` are intentional characterization tools here, not production
    // patterns, so relax these two rules for test code only.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
)

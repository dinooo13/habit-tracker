// Flat ESLint config for the repository. Composes the project-aware config the
// @nuxt/eslint module generates at `.nuxt/eslint.config.mjs` (run `nuxt prepare`
// / `npm install` to produce it). Formatting is handled by ESLint Stylistic,
// enabled via `eslint.config.stylistic` in `nuxt.config.ts`. See ADR-0013.
//
// Add narrow, documented overrides below only when a concrete lint finding
// requires it — no blanket source exclusions.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt()

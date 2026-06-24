// Mirrors app/utils/dummy-auth.ts. Kept as a standalone constant so the e2e
// suite stays decoupled from Nuxt auto-imports / runtime modules.
export const DUMMY_AUTH_STORAGE_KEY = 'habit-tracker:v1:dummy-auth'
// SEC-03: the dummy-auth session now carries an absolute expiry stamp; a session
// without a valid future expiry reads as logged-out. Seed both so the e2e
// `authedPage` fixture stays authenticated.
export const DUMMY_AUTH_EXPIRY_STORAGE_KEY = 'habit-tracker:v1:dummy-auth-expires-at'
export const DUMMY_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Keys that could be used for prototype-pollution. None are valid domain fields,
// so dropping them during parse is safe and adds defense-in-depth before the raw
// object reaches Zod validation (issue #1, SEC-19).
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * `JSON.parse` that strips dangerous keys via a reviver. Use this in place of raw
 * `JSON.parse` for any untrusted input (legacy migration, file import) that is
 * later validated by `parseAppData`.
 */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value) => (FORBIDDEN_KEYS.has(key) ? undefined : value))
}

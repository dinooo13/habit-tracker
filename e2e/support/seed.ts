import type { Page } from '@playwright/test'
import type { AppData } from '../../app/types/app-data'
import {
  DUMMY_AUTH_EXPIRY_STORAGE_KEY,
  DUMMY_AUTH_STORAGE_KEY,
  DUMMY_AUTH_TTL_MS,
} from './constants'

// The Dexie schema mirrored from app/utils/persistence/dexie-persistence-adapter.ts. The
// seed recreates the IndexedDB database with these exact stores/indexes so the
// app's bootstrap (load → hydrate) reads it back through Dexie without an
// upgrade. Keep in sync if the Dexie schema ever changes.
const DATABASE_NAME = 'habit-tracker'

interface SeedArg {
  databaseName: string
  data: AppData
}

// Runs in the browser. Deletes any existing database and writes a fresh one
// matching Dexie's version-1 schema, plus the meta records the adapter expects
// (`schemaVersion` and `settings`).
function seedIndexedDb({ databaseName, data }: SeedArg): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(databaseName)
    deleteRequest.onerror = () => reject(deleteRequest.error)
    deleteRequest.onblocked = () => reject(new Error('IndexedDB delete blocked'))
    deleteRequest.onsuccess = () => {
      const openRequest = indexedDB.open(databaseName, 1)

      openRequest.onerror = () => reject(openRequest.error)
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result
        const habits = db.createObjectStore('habits', { keyPath: 'id' })
        habits.createIndex('startDate', 'startDate')
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('habitId', 'habitId')
        entries.createIndex('date', 'date')
        entries.createIndex('status', 'status')
        const suggestions = db.createObjectStore('suggestions', { keyPath: 'id' })
        suggestions.createIndex('entryId', 'entryId')
        suggestions.createIndex('createdAt', 'createdAt')
        db.createObjectStore('meta', { keyPath: 'key' })
      }

      openRequest.onsuccess = () => {
        const db = openRequest.result
        const tx = db.transaction(['habits', 'entries', 'suggestions', 'meta'], 'readwrite')
        tx.onerror = () => reject(tx.error)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }

        for (const habit of data.habits) tx.objectStore('habits').put(habit)
        for (const entry of data.entries) tx.objectStore('entries').put(entry)
        for (const suggestion of data.suggestions) tx.objectStore('suggestions').put(suggestion)
        tx.objectStore('meta').put({ key: 'schemaVersion', value: data.schemaVersion })
        tx.objectStore('meta').put({ key: 'settings', value: data.settings })
      }
    }
  })
}

// A static asset that establishes the app origin WITHOUT booting the Nuxt app,
// so seeding does not race the bootstrap plugin for the IndexedDB connection.
const ORIGIN_ANCHOR = '/favicon.svg'

/**
 * Pre-populates IndexedDB with `data` before the app boots. Navigates to a
 * static asset to establish the origin (without starting the SPA), then writes
 * the database. Navigate to an app route afterwards (e.g. `page.goto('/app')`)
 * — the bootstrap plugin will hydrate the stores from the seeded database.
 */
export async function seedData(page: Page, data: AppData): Promise<void> {
  await page.goto(ORIGIN_ANCHOR)
  await page.evaluate(seedIndexedDb, { databaseName: DATABASE_NAME, data })
}

/**
 * Reads all records from a persisted IndexedDB store. Useful for asserting (or
 * polling) that a debounced save has actually landed before reloading.
 */
export function readPersistedStore<T = Record<string, unknown>>(
  page: Page,
  store: 'habits' | 'entries' | 'suggestions',
): Promise<T[]> {
  return page.evaluate(
    ({ databaseName, storeName }) => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(storeName, 'readonly')
          const all = tx.objectStore(storeName).getAll()
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
          all.onerror = () => reject(all.error)
        }
      })
    },
    { databaseName: DATABASE_NAME, storeName: store },
  )
}

/** Sets the dummy-auth flag (with a future expiry stamp) for the page's origin
 * before the app boots. SEC-03 treats a session without a valid future expiry as
 * logged-out, so both keys must be seeded. */
export async function authenticate(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, expiryKey, ttlMs]) => {
      window.localStorage.setItem(key as string, '1')
      window.localStorage.setItem(expiryKey as string, String(Date.now() + (ttlMs as number)))
    },
    [DUMMY_AUTH_STORAGE_KEY, DUMMY_AUTH_EXPIRY_STORAGE_KEY, DUMMY_AUTH_TTL_MS],
  )
}

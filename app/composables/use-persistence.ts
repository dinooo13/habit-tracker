import type { AppDataV1 } from '~/types/app-data'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

const STORAGE_KEY = 'habit-tracker:v1:data'
const LAST_VALID_STORAGE_KEY = 'habit-tracker:v1:last-valid'

export function usePersistence() {
  function load(): AppDataV1 {
    if (!import.meta.client) {
      return createEmptyAppData()
    }

    const value = window.localStorage.getItem(STORAGE_KEY)
    if (!value) {
      return createEmptyAppData()
    }

    try {
      const parsed = parseAppData(JSON.parse(value))
      window.localStorage.setItem(LAST_VALID_STORAGE_KEY, JSON.stringify(parsed))
      return parsed
    } catch {
      const fallback = window.localStorage.getItem(LAST_VALID_STORAGE_KEY)
      if (!fallback) {
        return createEmptyAppData()
      }

      try {
        return parseAppData(JSON.parse(fallback))
      } catch {
        return createEmptyAppData()
      }
    }
  }

  function save(payload: AppDataV1): void {
    if (!import.meta.client) {
      return
    }

    const serialized = JSON.stringify(payload)
    window.localStorage.setItem(STORAGE_KEY, serialized)
    window.localStorage.setItem(LAST_VALID_STORAGE_KEY, serialized)
  }

  function clear(): void {
    if (!import.meta.client) {
      return
    }

    window.localStorage.removeItem(STORAGE_KEY)
  }

  return {
    storageKey: STORAGE_KEY,
    load,
    save,
    clear
  }
}

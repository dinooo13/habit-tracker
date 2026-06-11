import type { AppDataV1 } from '~/types/app-data'
import { createEmptyAppData } from '~/utils/storage-schema'
import {
  HabitDatabase,
  clearAppData,
  loadAppData,
  migrateLegacyLocalStorage,
  saveAppData
} from '~/utils/habit-database'

let database: HabitDatabase | null = null

function getDatabase(): HabitDatabase {
  if (!database) {
    database = new HabitDatabase()
  }

  return database
}

export function usePersistence() {
  async function load(): Promise<AppDataV1> {
    if (!import.meta.client) {
      return createEmptyAppData()
    }

    const db = getDatabase()
    await migrateLegacyLocalStorage(db, window.localStorage)
    return loadAppData(db)
  }

  async function save(payload: AppDataV1): Promise<void> {
    if (!import.meta.client) {
      return
    }

    await saveAppData(getDatabase(), payload)
  }

  async function clear(): Promise<void> {
    if (!import.meta.client) {
      return
    }

    await clearAppData(getDatabase())
  }

  return {
    load,
    save,
    clear
  }
}

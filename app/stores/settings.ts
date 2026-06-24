import { defineStore } from 'pinia'
import { DEFAULT_SETTINGS, type AppSettings, type PrimaryColor } from '~/types/app-data'

interface SettingsState {
  settings: AppSettings
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    settings: { ...DEFAULT_SETTINGS }
  }),
  getters: {
    notificationsEnabled: (state) => state.settings.notificationsEnabled,
    dailyReviewTime: (state) => state.settings.dailyReviewTime,
    weekStartsOn: (state) => state.settings.weekStartsOn,
    primaryColor: (state) => state.settings.primaryColor,
    lastExportedAt: (state) => state.settings.lastExportedAt,
    backupNudgeSnoozedUntil: (state) => state.settings.backupNudgeSnoozedUntil
  },
  actions: {
    hydrate(settings: AppSettings): void {
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...settings
      }
    },
    snapshot(): AppSettings {
      return { ...this.settings }
    },
    setNotificationsEnabled(value: boolean): void {
      this.settings.notificationsEnabled = value
    },
    setDailyReviewTime(value: string | null): void {
      this.settings.dailyReviewTime = value
    },
    setWeekStartsOn(value: 0 | 1): void {
      this.settings.weekStartsOn = value
    },
    setPrimaryColor(value: PrimaryColor): void {
      this.settings.primaryColor = value
    },
    setLastExportedAt(value: string | null): void {
      this.settings.lastExportedAt = value
    },
    setBackupNudgeSnoozedUntil(value: string | null): void {
      this.settings.backupNudgeSnoozedUntil = value
    }
  }
})

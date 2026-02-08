import { defineStore } from 'pinia'
import { DEFAULT_SETTINGS, type AppSettings } from '~/types/app-data'

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
    weekStartsOn: (state) => state.settings.weekStartsOn
  },
  actions: {
    hydrate(settings: AppSettings): void {
      this.settings = { ...settings }
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
    }
  }
})

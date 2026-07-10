import type { Locator, Page } from '@playwright/test'

type FilePayload = { name: string, mimeType: string, buffer: Buffer }

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/settings')
  }

  loadDemoData(): Promise<void> {
    return this.page.getByRole('button', { name: 'Load demo data' }).click()
  }

  replaceAndLoadDemo(): Promise<void> {
    return this.page.getByRole('button', { name: 'Replace and load demo' }).click()
  }

  exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Export JSON' })
  }

  openImportModal(): Promise<void> {
    return this.page.getByRole('button', { name: 'Import JSON' }).click()
  }

  async setImportFile(file: string | FilePayload): Promise<void> {
    await this.page.locator('input[type="file"]').setInputFiles(file)
  }

  async toggleHabitsOnly(): Promise<void> {
    await this.page.getByRole('checkbox', { name: 'Import habits only' }).check()
  }

  confirmImport(): Promise<void> {
    return this.page.getByRole('button', { name: 'Import', exact: true }).click()
  }

  openDeleteModal(): Promise<void> {
    return this.page.getByRole('button', { name: 'Delete all data' }).click()
  }

  confirmDeleteAll(): Promise<void> {
    return this.page.getByRole('button', { name: 'Delete all', exact: true }).click()
  }
}

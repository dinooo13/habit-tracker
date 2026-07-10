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

  /**
   * Attach a synthetic File whose reported `size` is `sizeBytes` without allocating
   * a real multi-MiB buffer, and record whether the app reads it. Used to exercise
   * the pre-read file-size gate (issue #35): the import must reject before `text()`
   * is ever called.
   */
  async attachOversizedFile(sizeBytes: number): Promise<void> {
    await this.page.evaluate((size) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['{}'], 'huge.json', { type: 'application/json' })
      Object.defineProperty(file, 'size', { value: size })
      const originalText = file.text.bind(file)
      Object.defineProperty(file, 'text', {
        value: () => {
          ;(window as unknown as { __importFileTextRead?: boolean }).__importFileTextRead = true
          return originalText()
        },
      })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, sizeBytes)
  }

  wasImportFileRead(): Promise<boolean> {
    return this.page.evaluate(
      () => (window as unknown as { __importFileTextRead?: boolean }).__importFileTextRead === true,
    )
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

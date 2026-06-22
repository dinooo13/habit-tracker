import type { Locator, Page } from '@playwright/test'

export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app')
  }

  card(habitName: string): Locator {
    return this.page.locator('.queue-card').filter({ hasText: habitName })
  }

  get cards(): Locator {
    return this.page.locator('.queue-card')
  }

  openTab(): Promise<void> {
    return this.page.getByRole('tab', { name: 'Open' }).click()
  }

  reviewedTab(): Promise<void> {
    return this.page.getByRole('tab', { name: 'Reviewed' }).click()
  }

  markDone(habitName: string): Promise<void> {
    return this.card(habitName).getByRole('button', { name: 'Done' }).click()
  }

  markMissed(habitName: string): Promise<void> {
    return this.card(habitName).getByRole('button', { name: 'Missed' }).click()
  }

  markSkipped(habitName: string): Promise<void> {
    return this.card(habitName).getByRole('button', { name: 'Skip' }).click()
  }

  reopen(habitName: string): Promise<void> {
    return this.card(habitName).getByRole('button', { name: 'Reopen' }).click()
  }

  previousDay(): Promise<void> {
    return this.page.getByRole('button', { name: 'Previous day' }).click()
  }

  nextDay(): Promise<void> {
    return this.page.getByRole('button', { name: 'Next day' }).click()
  }

  backToToday(): Promise<void> {
    return this.page.getByRole('button', { name: 'Back to today' }).click()
  }

  datePickerButton(): Locator {
    return this.page.getByRole('button', { name: /^Pick a date/ })
  }

  progressText(): Locator {
    return this.page.getByText(/of \d+ reviewed/)
  }
}

import type { Locator, Page } from '@playwright/test'

// The form renders weekday checkboxes in the user's `weekStartsOn` display
// order (HabitForm.vue). Each checkbox carries a stable `data-weekday`
// attribute (0=Sun..6=Sat), so tests target weekdays by identity rather than
// DOM position and stay valid under either week-start preference.

export interface HabitFormInput {
  name?: string
  type?: 'build' | 'break'
  identityStatement?: string
  startDate?: string
  /** Weekday numbers (0=Sun..6=Sat) that should end up CHECKED. */
  weekdays?: number[]
  reminderTime?: string
  archived?: boolean
}

export class HabitFormPage {
  constructor(private readonly page: Page) {}

  async gotoNew(): Promise<void> {
    await this.page.goto('/app/habits/new')
  }

  async setName(value: string): Promise<void> {
    await this.page.getByLabel('Habit name').fill(value)
  }

  async setIdentity(value: string): Promise<void> {
    await this.page.getByLabel('Identity statement').fill(value)
  }

  async chooseType(type: 'build' | 'break'): Promise<void> {
    const label = type === 'build' ? 'Build good habit' : 'Break bad habit'
    await this.page.getByText(label).click()
  }

  async setStartDate(dateKey: string): Promise<void> {
    await this.page.getByLabel('Start date').fill(dateKey)
  }

  weekdayCheckbox(weekday: number): Locator {
    return this.page.locator(`[data-weekday="${weekday}"]`)
  }

  async setWeekdays(weekdays: number[]): Promise<void> {
    // Normalize all seven checkboxes so the resulting selection is exactly `weekdays`.
    for (let day = 0; day < 7; day += 1) {
      await this.weekdayCheckbox(day).setChecked(weekdays.includes(day))
    }
  }

  /** Weekday numbers in the order the checkboxes are rendered (left→right). */
  async renderedWeekdayOrder(): Promise<number[]> {
    const values = await this.page.locator('[data-weekday]').evaluateAll(nodes =>
      nodes.map(node => Number(node.getAttribute('data-weekday'))),
    )
    return values
  }

  async setArchived(archived: boolean): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: 'Archive this habit' })
    if (archived) {
      await checkbox.check()
    }
    else {
      await checkbox.uncheck()
    }
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /Create habit|Save habit|Save changes/ }).click()
  }

  async fill(input: HabitFormInput): Promise<void> {
    if (input.type) await this.chooseType(input.type)
    if (input.name !== undefined) await this.setName(input.name)
    if (input.identityStatement !== undefined) await this.setIdentity(input.identityStatement)
    if (input.startDate !== undefined) await this.setStartDate(input.startDate)
    if (input.weekdays) await this.setWeekdays(input.weekdays)
    if (input.archived !== undefined) await this.setArchived(input.archived)
  }
}

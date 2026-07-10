import { test, expect } from '../support/fixtures'
import { SettingsPage } from '../support/pages/settings'
import { makeAppData, makeHabit } from '../support/data'
import { COLLECTION_LIMITS, MAX_IMPORT_FILE_BYTES } from '../../app/types/app-data'

test.describe('Settings: backup & restore', () => {
  test('export downloads a valid JSON backup', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ name: 'Hydrate' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    const downloadPromise = page.waitForEvent('download')
    await settings.exportButton().click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^habit-tracker-\d{4}-\d{2}-\d{2}\.json$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    expect(payload.schemaVersion).toBe(2)
    expect(payload.habits.map((h: { name: string }) => h.name)).toContain('Hydrate')
  })

  test('full import replaces current data', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ name: 'Original habit' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    const backup = makeAppData({ habits: [makeHabit({ id: 'habit_imported', name: 'Imported habit' })] })

    await settings.openImportModal()
    await settings.setImportFile({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })
    await settings.confirmImport()

    await expect(page.getByText('Import complete').first()).toBeVisible()

    await page.getByRole('link', { name: 'Habits', exact: true }).click()
    await expect(page.locator('.habit-card').filter({ hasText: 'Imported habit' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Original habit' })).toHaveCount(0)
  })

  test('habits-only import merges with existing habits', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ id: 'habit_keep', name: 'Kept habit' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    const habitsOnly = { habits: [makeHabit({ id: 'habit_added', name: 'Added habit' })] }

    await settings.openImportModal()
    await settings.toggleHabitsOnly()
    await settings.setImportFile({
      name: 'habits.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(habitsOnly)),
    })
    await settings.confirmImport()

    await expect(page.getByText('Habits imported').first()).toBeVisible()

    await page.getByRole('link', { name: 'Habits', exact: true }).click()
    await expect(page.locator('.habit-card').filter({ hasText: 'Kept habit' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Added habit' })).toBeVisible()
  })

  test('an oversized file is rejected before it is read (#35)', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ name: 'Untouched habit' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    await settings.openImportModal()
    await settings.attachOversizedFile(MAX_IMPORT_FILE_BYTES + 1)
    await settings.confirmImport()

    await expect(page.getByText('Import failed').first()).toBeVisible()
    // The file must never be read into memory.
    expect(await settings.wasImportFileRead()).toBe(false)
    // Modal stays open for another attempt, and existing data is unchanged.
    await expect(page.getByRole('heading', { name: 'Import JSON' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.goto('/app/habits')
    await expect(page.locator('.habit-card').filter({ hasText: 'Untouched habit' })).toBeVisible()
  })

  test('habits-only import over the habit cap is rejected atomically (#35)', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ id: 'habit_seed', name: 'Seeded habit' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    const overCap = {
      habits: Array.from({ length: COLLECTION_LIMITS.habits + 1 }, (_, index) => ({
        id: `habit_over_${index}`,
        name: `Bulk habit ${index}`,
        type: 'build',
        identityStatement: 'I am bulk.',
        scheduleWeekdays: [1],
        reminderTime: null,
        startDate: '2026-01-01',
        archived: false,
        pauses: [],
      })),
    }

    await settings.openImportModal()
    await settings.toggleHabitsOnly()
    await settings.setImportFile({
      name: 'too-many-habits.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(overCap)),
    })
    await settings.confirmImport()

    await expect(page.getByText('Import failed').first()).toBeVisible()

    // Atomic rejection: seeded habit remains, none of the bulk habits were merged.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.goto('/app/habits')
    await expect(page.locator('.habit-card').filter({ hasText: 'Seeded habit' })).toBeVisible()
    await expect(page.locator('.habit-card').filter({ hasText: 'Bulk habit' })).toHaveCount(0)
  })

  test('an invalid import file is rejected', async ({ authedPage: page }) => {
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    await settings.openImportModal()
    await settings.setImportFile({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not valid json {{{'),
    })
    await settings.confirmImport()

    await expect(page.getByText('Import failed').first()).toBeVisible()
  })

  test('delete all data clears habits', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ name: 'Doomed habit' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    await settings.openDeleteModal()
    await settings.confirmDeleteAll()

    await expect(page.getByText('All data deleted').first()).toBeVisible()

    await page.getByRole('link', { name: 'Habits', exact: true }).click()
    await expect(page.getByText('No habits yet')).toBeVisible()
  })
})

test.describe('Demo data', () => {
  test('loading demo data populates the app', async ({ authedPage: page }) => {
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    await settings.loadDemoData()
    await expect(page.getByText('Demo data loaded').first()).toBeVisible()

    await page.getByRole('link', { name: 'Habits', exact: true }).click()
    await expect(page.locator('.habit-card').first()).toBeVisible()
  })

  test('demo load is guarded when data already exists', async ({ authedPage: page, seed }) => {
    await seed(makeAppData({ habits: [makeHabit({ name: 'Existing' })] }))
    await page.goto('/app/settings')
    const settings = new SettingsPage(page)

    await settings.loadDemoData()
    // A confirmation modal appears rather than silently overwriting.
    await expect(page.getByRole('heading', { name: 'Replace existing data?' })).toBeVisible()
    await settings.replaceAndLoadDemo()
    await expect(page.getByText('Demo data loaded').first()).toBeVisible()
  })
})

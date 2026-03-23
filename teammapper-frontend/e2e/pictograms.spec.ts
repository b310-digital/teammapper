import { test, expect } from '@playwright/test';

const mockPictogramResponse = [
  {
    _id: 6009,
    keywords: [{ keyword: 'dog', type: 1, hasLocation: false }],
    categories: ['animals'],
    synsets: ['dog'],
    tags: ['animal'],
    schematic: false,
    sex: false,
    violence: false,
    aac: false,
    aacColor: false,
    skin: false,
    hair: false,
    downloads: 100,
    created: '2020-01-01T00:00:00.000Z',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  },
  {
    _id: 6010,
    keywords: [{ keyword: 'puppy', type: 1, hasLocation: false }],
    categories: ['animals'],
    synsets: ['puppy'],
    tags: ['animal'],
    schematic: false,
    sex: false,
    violence: false,
    aac: false,
    aacColor: false,
    skin: false,
    hair: false,
    downloads: 50,
    created: '2020-01-01T00:00:00.000Z',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  },
];

test('pictogram search results appear immediately', async ({ page }) => {
  // Ensure pictograms feature flag is enabled
  await page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.pictograms = true;
    await route.fulfill({ response, json });
  });

  // Mock the ARASAAC pictogram search API
  await page.route(
    '**/api.arasaac.org/v1/pictograms/*/search/*',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPictogramResponse),
      });
    }
  );

  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  // Click the pictogram button in the toolbar
  await page.locator('button:has(mat-icon:has-text("nature_people"))').click();

  // Wait for dialog
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();

  // Type search term and click search button
  await dialog.locator('input[matInput]').fill('dog');
  await dialog.locator('button:has(mat-icon:has-text("search"))').click();

  // Pictogram images should appear immediately without additional interaction
  const images = dialog.locator('mat-grid-tile img');
  await expect(images).toHaveCount(2, { timeout: 5000 });
});

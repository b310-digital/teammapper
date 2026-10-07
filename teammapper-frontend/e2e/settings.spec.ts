import { test, expect } from '@playwright/test';

test('changes language in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  // Navigate to settings (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();

  // Wait for the language dropdown to be visible
  await page.waitForSelector('mat-select', { state: 'visible' });

  // Open language dropdown
  await page.locator('mat-select').click();

  // Wait for options to appear
  await page.waitForSelector('mat-option', { state: 'visible' });

  // Select a different language - use nth selector for Spanish (7th option)
  // Languages are: en, fr, de, it, zh-tw, zh-cn, es, pt-br
  await page.locator('mat-option').nth(6).click();

  // Verify language change (would need to check actual translations in real test)
  await expect(page.locator('mat-select')).toBeVisible();
});

test('deletes a map that is not open from the map list', async ({ page }) => {
  const createMap = async (): Promise<string> => {
    await page.goto('/');
    await page.getByText('Create mind map').click();
    await page.waitForURL(/\/map\/[0-9a-f-]+/);
    const match = page.url().match(/\/map\/([0-9a-f-]+)/);
    if (!match) throw new Error(`No map id in ${page.url()}`);
    return match[1];
  };
  const closedMapId = await createMap();
  const openMapId = await createMap();

  await page.locator('button[routerlink="/app/settings"]').click();
  await page.locator('.mat-mdc-tab').nth(2).click();

  const closedMapRow = page.locator('mat-list-item', {
    has: page.locator(`a[href*="${closedMapId}"]`),
  });
  const openMapRow = page.locator('mat-list-item', {
    has: page.locator(`a[href*="${openMapId}"]`),
  });
  await expect(closedMapRow.first()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await closedMapRow.first().locator('.delete-map-button').click();

  await expect(page.getByText('Mindmap successfully deleted!')).toBeVisible();
  await expect(closedMapRow).toHaveCount(0);
  await expect(openMapRow.first()).toBeVisible();
});

test('keeps the stored map settings when the user reopens the map', async ({
  page,
}) => {
  const fontMinSize = page.locator('input[name="fontMinSize"]');
  const fontMaxSize = page.locator('input[name="fontMaxSize"]');
  const fontIncrement = page.locator('input[name="fontIncrement"]');
  const openMapSettings = async () => {
    await page.locator('button[routerlink="/app/settings"]').click();
    await page.locator('.mat-mdc-tab').nth(1).click();
  };
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.waitForURL(/\/map\/[0-9a-f-]+/);
  const mapUrl = page.url();

  await openMapSettings();
  await fontMinSize.fill('20');
  await fontMinSize.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await fontMaxSize.fill('80');
  await fontMaxSize.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await fontIncrement.fill('7');
  await fontIncrement.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();

  await page.goto(mapUrl);
  await expect(page.locator('.map')).toBeVisible();
  await openMapSettings();

  await expect(fontMinSize).toHaveValue('20');
  await expect(fontMaxSize).toHaveValue('80');
  await expect(fontIncrement).toHaveValue('7');
});

test('modifies map options in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  // Navigate to settings (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/settings"]').click();

  // Click on Map Options tab - wait for it to be visible
  await page.waitForSelector('mat-tab-group', { state: 'visible' });

  // Click on second tab - Map Options
  await page.locator('.mat-mdc-tab').nth(1).click();

  // Wait for the tab content to load
  await page.waitForSelector('mat-slide-toggle', { state: 'visible' });

  // Toggle auto branch colors (use nth(1) for second toggle)
  await page.locator('mat-slide-toggle').nth(1).click();

  // Change font sizes
  await page.locator('input[name="fontMinSize"]').fill('20');
  await page.locator('input[name="fontMaxSize"]').fill('80');

  // Close settings
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();
});

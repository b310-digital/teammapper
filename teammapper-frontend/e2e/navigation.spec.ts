import { test, expect, Page } from '@playwright/test';

test('navigates to settings page and back to map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  // Navigate to settings
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();
  // Check for the settings title - the text might be translated
  await expect(page.locator('h2[mat-dialog-title]')).toBeVisible();
  // Wait for route animation to finish so old map component is fully removed
  await expect(page.locator('.map')).toHaveCount(0);

  // Navigate back
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();
});

test.describe('info dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Create mind map').click();
    await page.waitForURL(/\/map\/.*/);
    await expect(page.getByText('Root node')).toBeVisible();
  });

  const dialog = (page: Page) => page.locator('mat-dialog-container');
  const nodes = (page: Page) => page.locator('.map [class$="_node"]');

  test('info button opens the dialog with the shortcut list', async ({
    page,
  }) => {
    const mapUrl = page.url();

    await page.locator("button[title='Opens info and shortcuts']").click();

    await expect(dialog(page)).toHaveCount(1);
    await expect(
      dialog(page).getByRole('heading', { name: 'Keyboard shortcuts' })
    ).toBeVisible();
    await expect(dialog(page).getByText('Adds a node')).toBeVisible();
    expect(page.url()).toBe(mapUrl);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(mapUrl);
    await expect(page.locator('.map')).toBeVisible();
  });

  test('? opens one dialog only', async ({ page }) => {
    const mapUrl = page.url();

    await page.keyboard.press('?');
    await expect(dialog(page)).toHaveCount(1);
    await expect(
      dialog(page).getByRole('heading', { name: 'Keyboard shortcuts' })
    ).toBeVisible();

    await page.keyboard.press('?');
    await page
      .locator("button[title='Opens info and shortcuts']")
      .dispatchEvent('click');
    await expect(dialog(page)).toHaveCount(1);
    expect(page.url()).toBe(mapUrl);
  });

  test('map shortcuts rest while the dialog is open', async ({ page }) => {
    await page.getByText('Root node').click();
    const count = await nodes(page).count();

    await page.keyboard.press('?');
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press('+');
    await expect(nodes(page)).toHaveCount(count);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await page.keyboard.press('+');
    await expect(nodes(page)).toHaveCount(count + 1);
  });
});

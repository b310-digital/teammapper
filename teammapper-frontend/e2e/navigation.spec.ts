import { test, expect, Page } from '@playwright/test';
import { createMap } from './helpers';

test.describe('settings dialog', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page);
  });

  const dialog = (page: Page) => page.locator('mat-dialog-container');
  const nodes = (page: Page) => page.locator('.map g.node');

  test('settings button opens the dialog over the map', async ({ page }) => {
    const mapUrl = page.url();

    await page.locator('#settings-button').click();

    await expect(dialog(page).locator('.settings')).toBeVisible();
    await expect(dialog(page).locator('h2[mat-dialog-title]')).toBeVisible();
    await expect(page.locator('.map')).toHaveCount(1);
    expect(page.url()).toBe(mapUrl);

    await dialog(page).locator('.close-button').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(mapUrl);
  });

  test('alt+s opens one dialog only', async ({ page }) => {
    await page.keyboard.press('Alt+s');
    await expect(dialog(page)).toHaveCount(1);

    await page.keyboard.press('Alt+s');
    await page.locator('#settings-button').dispatchEvent('click');
    await expect(dialog(page)).toHaveCount(1);
  });

  test('map shortcuts rest while the dialog is open', async ({ page }) => {
    await page.getByText('Root node').click();
    const count = await nodes(page).count();

    await page.locator('#settings-button').click();
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press('+');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // The page handles keys in order, so a node the first + added would
    // exist by now.
    expect(await nodes(page).count()).toBe(count);

    await page.keyboard.press('+');
    await expect(nodes(page)).toHaveCount(count + 1);
  });
});

test.describe('info dialog', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page);
  });

  const dialog = (page: Page) => page.locator('mat-dialog-container');
  const nodes = (page: Page) => page.locator('.map g.node');

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
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // The page handles keys in order, so a node the first + added would
    // exist by now.
    expect(await nodes(page).count()).toBe(count);

    await page.keyboard.press('+');
    await expect(nodes(page)).toHaveCount(count + 1);
  });
});

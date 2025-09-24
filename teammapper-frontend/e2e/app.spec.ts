import { test, expect } from '@playwright/test';

/*
 * Playwright e2e tests
 */

test('creates a map and changes the location', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  await expect(page.getByText('Root node')).toBeVisible();
});

test('adds a new node to the map that is saved and retrieved when reloaded', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();

  await page.locator('#floating-add-node').click();
  await page.keyboard.type('New Node');
  // End editing by clicking somewhere else
  await page.locator('.map').click();
  await expect(page.getByText('New Node')).toBeVisible();
  await page.reload();
  // Check if the element is still visible even after reloading, which means it was stored and retrieved from the backend.
  await expect(page.getByText('New Node')).toBeVisible();
});

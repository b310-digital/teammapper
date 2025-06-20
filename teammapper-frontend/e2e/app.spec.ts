import { test, expect } from '@playwright/test';

/*
 * Playwright e2e tests
 */

test.beforeEach(async ({ context }) => {
//   // Proxy requests to localhost instead of using localhost as its currently used for the dev environment
//   await context.route(/socket.io|api|arasaac/, route => {
//     const request = route.request();
//     const url = new URL(request.url());
//     url.hostname = 'localhost';
//     route.continue({ url: url.toString() });
//   });
// });

test('creates a map and changes the location', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  await expect(page.getByText('Root node')).toBeVisible();
});

test('adds a new node to the map that is saved and retrieved when reloaded', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  await page.locator("button[title='Adds a node']").first().click();
  await page.keyboard.type('New Node');
  // End editing by clicking somewhere else
  await page.locator('.map').first().click();
  await expect(page.getByText('New Node')).toBeVisible();
  await page.reload();
  // Check if the element is still visible even after reloading, which means it was stored and retrieved from the backend.
  await expect(page.getByText('New Node')).toBeVisible();
});

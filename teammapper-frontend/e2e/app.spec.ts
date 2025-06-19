import { test, expect } from '@playwright/test';

/*
 * Playwright e2e tests
 */

test.beforeEach(async ({ context }) => {
  // Proxy requests to the app container instead of using localhost as its currently used for the dev environment
  await context.route(/socket.io|api|arasaac/, route => {
    const request = route.request();
    const url = new URL(request.url());
    url.hostname = 'app';
    route.continue({ url: url.toString() });
  });
});

test('creates a map and changes the location', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  await expect(page.locator('.map_1_node').first()).toBeVisible();
});

test('adds a new node to the map that is saved and retrieved when reloaded', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map_1_node').first()).toBeVisible();
  await page.locator("button[title='Adds a node']").first().click();
  await expect(page.locator('.map_1_node')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.map_1_node')).toHaveCount(2);
});

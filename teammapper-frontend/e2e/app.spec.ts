import { test, expect } from '@playwright/test';

/*
 * Playwright e2e tests
 */

test.beforeEach(async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
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

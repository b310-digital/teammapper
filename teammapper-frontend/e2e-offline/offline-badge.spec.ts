import { test, expect } from '@playwright/test';
import { createMap } from '../e2e/helpers';

test('marks the start page as offline mode', async ({ page }) => {
  await page.goto('/');

  const badges = page.locator('.offline-badge');
  await expect(badges).toHaveCount(2);
  await expect(badges.nth(0)).toContainText('Offline mode');
  await expect(badges.nth(1)).toContainText('do not sync with peers');
});

test('marks the map as offline mode', async ({ page }) => {
  await createMap(page);

  const badge = page.locator('.offline-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('Offline mode');
  await expect(badge).toHaveAttribute('title', /do not sync with peers/);
});

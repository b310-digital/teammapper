import { test, expect } from '@playwright/test';

test('navigates to settings page and back to map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  
  // Navigate to settings
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();
  // Check for the settings title - the text might be translated
  await expect(page.locator('h2[mat-dialog-title]')).toBeVisible();
  
  // Navigate back
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();
});

test('navigates to shortcuts page', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.waitForURL(/\/map\/.*/);
  
  // Navigate to shortcuts
  await page.locator('button[routerlink="/app/shortcuts"]').click();
  await page.waitForURL(/\/app\/shortcuts/);
  expect(page.url()).toContain('/app/shortcuts');
});
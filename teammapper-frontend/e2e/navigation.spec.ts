import { test, expect } from '@playwright/test';

test('navigates to settings page and back to map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  
  // Navigate to settings
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();
  await expect(page.getByText('PAGES.SETTINGS.TITLE')).toBeVisible();
  
  // Navigate back
  await page.locator('.close-button').click();
  await expect(page.locator('.map').first()).toBeVisible();
});

test('navigates to shortcuts page', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to shortcuts
  await page.locator('button[routerlink="/app/shortcuts"]').click();
  await expect(page.url()).toContain('/app/shortcuts');
});
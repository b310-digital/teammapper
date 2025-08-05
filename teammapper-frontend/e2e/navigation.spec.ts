import { test, expect } from '@playwright/test';

test('navigates to settings page and back to map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  
  // Navigate to settings (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/settings"]').first().click();
  await expect(page.locator('.settings')).toBeVisible();
  // Check for the settings title - the text might be translated
  await expect(page.locator('h2[mat-dialog-title]')).toBeVisible();
  
  // Navigate back
  await page.locator('.close-button').click();
  await expect(page.locator('.map').first()).toBeVisible();
});

test('navigates to shortcuts page', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to shortcuts (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/shortcuts"]').first().click();
  await expect(page.url()).toContain('/app/shortcuts');
});
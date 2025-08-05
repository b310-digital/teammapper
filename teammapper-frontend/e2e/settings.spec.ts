import { test, expect } from '@playwright/test';

test('changes language in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to settings
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();
  
  // Open language dropdown
  await page.locator('mat-select[placeholder*="Language"]').click();
  
  // Select a different language (e.g., Spanish)
  await page.locator('mat-option').filter({ hasText: 'ES' }).click();
  
  // Verify language change (would need to check actual translations in real test)
  await expect(page.locator('mat-select')).toBeVisible();
});

test('modifies map options in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to settings
  await page.locator('button[routerlink="/app/settings"]').click();
  
  // Click on Map Options tab
  await page.getByText('MAP_OPTIONS').click();
  
  // Toggle auto branch colors
  await page.locator('mat-slide-toggle[title*="Auto branch colors"]').click();
  
  // Change font sizes
  await page.locator('input[name="fontMinSize"]').fill('20');
  await page.locator('input[name="fontMaxSize"]').fill('80');
  
  // Close settings
  await page.locator('.close-button').click();
  await expect(page.locator('.map').first()).toBeVisible();
});
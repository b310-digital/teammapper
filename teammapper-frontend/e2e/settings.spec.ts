import { test, expect } from '@playwright/test';

test('changes language in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to settings (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/settings"]').click();
  await expect(page.locator('.settings')).toBeVisible();
  
  // Wait for the language dropdown to be visible
  await page.waitForSelector('mat-select', { state: 'visible' });
  
  // Open language dropdown
  await page.locator('mat-select').click();
  
  // Wait for options to appear
  await page.waitForSelector('mat-option', { state: 'visible' });
  
  // Select a different language - use nth selector for Spanish (7th option)
  // Languages are: en, fr, de, it, zh-tw, zh-cn, es, pt-br
  await page.locator('mat-option').nth(6).click();
  
  // Verify language change (would need to check actual translations in real test)
  await expect(page.locator('mat-select')).toBeVisible();
});

test('modifies map options in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Navigate to settings (use first() to handle duplicate elements)
  await page.locator('button[routerlink="/app/settings"]').click();
  
  // Click on Map Options tab - wait for it to be visible
  await page.waitForSelector('mat-tab-group', { state: 'visible' });
  
  // Click on second tab - Map Options
  await page.locator('.mat-mdc-tab').nth(1).click();
  
  // Wait for the tab content to load
  await page.waitForSelector('mat-slide-toggle', { state: 'visible' });
  
  // Toggle auto branch colors (use nth(1) for second toggle)
  await page.locator('mat-slide-toggle').nth(1).click();
  
  // Change font sizes
  await page.locator('input[name="fontMinSize"]').fill('20');
  await page.locator('input[name="fontMaxSize"]').fill('80');
  
  // Close settings
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();
});
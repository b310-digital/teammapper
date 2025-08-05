import { test, expect } from '@playwright/test';

test('uses zoom controls and center map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  
  // Test zoom in
  await page.locator('#zoom-in-button').click();
  
  // Test zoom out
  await page.locator('#zoom-out-button').click();
  await page.locator('#zoom-out-button').click();
  
  // Test center
  await page.locator('#center-map-button').click();
  
  // Map should still be visible after all operations
  await expect(page.locator('.map').first()).toBeVisible();
  await expect(page.getByText('Root node')).toBeVisible();
});
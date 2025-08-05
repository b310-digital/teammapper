import { test, expect } from '@playwright/test';

test('uses zoom controls and center map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  
  // Test zoom in (use first() to handle duplicate elements)
  await page.locator('#zoom-in-button').first().click();
  
  // Test zoom out (use first() to handle duplicate elements)
  await page.locator('#zoom-out-button').first().click();
  await page.locator('#zoom-out-button').first().click();
  
  // Test center (use first() to handle duplicate elements)
  await page.locator('#center-map-button').first().click();
  
  // Map should still be visible after all operations
  await expect(page.locator('.map').first()).toBeVisible();
  await expect(page.getByText('Root node')).toBeVisible();
});
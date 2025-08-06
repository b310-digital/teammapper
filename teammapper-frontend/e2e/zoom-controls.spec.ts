import { test, expect } from '@playwright/test';

test('uses zoom controls and center map', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  
  // Test zoom in (use first() to handle duplicate elements)
  await page.locator('#zoom-in-button').click();
  
  // Test zoom out (use first() to handle duplicate elements)
  await page.locator('#zoom-out-button').click();
  await page.locator('#zoom-out-button').click();
  
  // Test center (use first() to handle duplicate elements)
  await page.locator('#center-map-button').click();
  
  // Map should still be visible after all operations
  await expect(page.locator('.map')).toBeVisible();
  await expect(page.getByText('Root node')).toBeVisible();
});
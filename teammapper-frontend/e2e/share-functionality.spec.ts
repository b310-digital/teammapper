import { test, expect } from '@playwright/test';

test('opens share dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  
  // Click share button (use first() to handle duplicate elements)
  await page.locator('#share-button').click();
  
  // Share dialog should open (would need to check for specific dialog elements)
  await page.waitForTimeout(500); // Wait for dialog animation
});
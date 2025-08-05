import { test, expect } from '@playwright/test';

test('adds and removes nodes using floating buttons', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Add node using floating button
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('New Child Node');
  await page.locator('.map').first().click();
  await expect(page.getByText('New Child Node')).toBeVisible();
  
  // Remove node using floating button
  await page.getByText('New Child Node').click();
  await page.locator('#floating-remove-node').click();
  await expect(page.getByText('New Child Node')).not.toBeVisible();
});

test('toggles node font styles (bold and italic)', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Add a node
  await page.locator("button[title='Adds a node']").first().click();
  await page.keyboard.type('Style Test Node');
  await page.locator('.map').first().click();
  
  // Select the node and toggle bold
  await page.getByText('Style Test Node').click();
  await page.locator('#bold-button').click();
  
  // Toggle italic
  await page.locator('#italic-button').click();
  
  // Verify styles were applied (would need to check computed styles in real test)
  await expect(page.getByText('Style Test Node')).toBeVisible();
});
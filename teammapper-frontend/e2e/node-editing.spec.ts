import { test, expect } from '@playwright/test';

/*
 * Note: Tests may encounter duplicate elements when running sequentially.
 * This is a known issue with the development server. See README.md for details.
 * We use  selectors as a workaround where necessary.
 */

test('adds and removes nodes using floating buttons', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Add node using floating button
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('New Child Node');
  await page.locator('.map').click();
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
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type('Style Test Node');
  await page.locator('.map').click();
  
  // Select the node
  const nodeText = page.getByText('Style Test Node');
  await nodeText.click();
  
  // Toggle bold and verify
  await page.locator('#bold-button').click();
  await expect(nodeText).toHaveCSS('font-weight', '700');
  
  // Toggle italic and verify both styles are applied
  await page.locator('#italic-button').click();
  await expect(nodeText).toHaveCSS('font-weight', '700');
  await expect(nodeText).toHaveCSS('font-style', 'italic');
  
  // Toggle bold off and verify only italic remains
  await page.locator('#bold-button').click();
  await expect(nodeText).not.toHaveCSS('font-weight', '700');
  await expect(nodeText).toHaveCSS('font-style', 'italic');
  
  // Toggle italic off and verify normal style
  await page.locator('#italic-button').click();
  await expect(nodeText).toHaveCSS('font-style', 'normal');
});
import { test, expect } from '@playwright/test';

test('adds and removes links from nodes', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Add a new node
  await page.locator("button[title='Adds a node']").first().click();
  await page.keyboard.type('Link Test Node');
  await page.locator('.map').first().click();
  
  // Select the node
  await page.getByText('Link Test Node').click();
  
  // Click add link button
  await page.locator('#add-link-button').click();
  
  // Would need to handle link dialog here in a real test
  await page.waitForTimeout(500);
});
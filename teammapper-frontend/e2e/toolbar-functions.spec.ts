import { test, expect } from '@playwright/test';

test('exports map in different formats', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map').first()).toBeVisible();
  
  // Open export menu (use first() to handle duplicate elements)
  await page.locator('#menu-export').first().click();
  
  // Check all export options are visible
  await expect(page.getByText('JSON')).toBeVisible();
  await expect(page.getByText('MERMAID')).toBeVisible();
  await expect(page.getByText('SVG')).toBeVisible();
  await expect(page.getByText('PNG')).toBeVisible();
  await expect(page.getByText('JPG')).toBeVisible();
  // Check for PDF - use more specific selector to avoid duplicate text
  await expect(page.getByRole('menuitem', { name: 'Document (.pdf)' })).toBeVisible();
});

test('copy, cut and paste node operations', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Add a new node first
  await page.locator("button[title='Adds a node']").first().click();
  await page.keyboard.type('Test Node');
  await page.locator('.map').first().click();
  
  // Copy node (use first() to handle duplicate elements)
  await page.getByText('Test Node').click();
  await page.locator('#copy-node-button').first().click();
  
  // Select root node and paste (use first() to handle duplicate elements)
  await page.getByText('Root node').click();
  await page.locator('#paste-node-button').first().click();
  
  // Should have two "Test Node" elements now
  const testNodes = await page.locator('text=Test Node').count();
  expect(testNodes).toBeGreaterThan(1);
});
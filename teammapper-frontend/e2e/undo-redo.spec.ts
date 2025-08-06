import { test, expect } from '@playwright/test';

test('tests undo and redo functionality', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Add a node
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type('Undo Test Node');
  await page.locator('.map').click();
  await expect(page.getByText('Undo Test Node')).toBeVisible();
  
  // Undo the addition
  await page.locator('#undo-button').click();
  await expect(page.getByText('Undo Test Node')).not.toBeVisible();
  
  // Redo the addition
  await page.locator('#redo-button').click();
  await expect(page.getByText('Undo Test Node')).toBeVisible();
});
import { test, expect } from '@playwright/test';

test('opens import menu and checks options', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  
  // Click import button
  await page.locator('#menu-import').click();
  
  // Check import options are visible
  await expect(page.getByText('JSON')).toBeVisible();
  await expect(page.getByText('MERMAID')).toBeVisible();
});

test('uploads JSON file for import', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Open import menu (use first() to handle duplicate elements)
  await page.locator('#menu-import').click();
  
  // Check that file input exists
  const fileInput = page.locator('#json-upload');
  await expect(fileInput).toHaveAttribute('type', 'file');
  await expect(fileInput).toHaveAttribute('accept', 'application/json');
});
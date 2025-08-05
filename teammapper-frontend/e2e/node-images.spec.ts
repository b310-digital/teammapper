import { test, expect } from '@playwright/test';

test('adds image to node', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Add a new node
  await page.locator("button[title='Adds a node']").first().click();
  await page.keyboard.type('Image Test Node');
  await page.locator('.map').first().click();
  
  // Select the node
  await page.getByText('Image Test Node').click();
  
  // Check that image upload button exists
  const imageInput = page.locator('#image-upload');
  await expect(imageInput).toHaveAttribute('type', 'file');
  await expect(imageInput).toHaveAttribute('accept', 'image/*');
});
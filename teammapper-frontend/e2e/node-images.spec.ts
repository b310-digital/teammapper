import { test, expect } from '@playwright/test';
import path from 'path';

test('adds image to node', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  
  // Add a new node
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type('Image Test Node');
  await page.locator('.map').click();
  
  // Select the node
  await page.getByText('Image Test Node').click();
  
  // Upload image to the node
  const imageInput = page.locator('#image-upload');
  await expect(imageInput).toHaveAttribute('type', 'file');
  await expect(imageInput).toHaveAttribute('accept', 'image/*');
  
  // Upload the test image
  const imagePath = path.join(__dirname, 'fake-data', 'radial-tree.png');
  await imageInput.setInputFiles(imagePath);
  
  // Verify the image appears in the node (as an SVG image element)
  const nodeImage = page.locator('svg image').first();
  await expect(nodeImage).toBeVisible({ timeout: 5000 });
  
  // Verify the image has the correct source (should contain base64 data)
  const imageSrc = await nodeImage.getAttribute('href');
  expect(imageSrc).toBeTruthy();
  expect(imageSrc).toContain('data:image'); // Base64 images start with data:image
  
  // Verify the image is rendered with appropriate dimensions
  const width = await nodeImage.getAttribute('width');
  const height = await nodeImage.getAttribute('height');
  expect(parseFloat(width)).toBeGreaterThan(0);
  expect(parseFloat(height)).toBeGreaterThan(0);
  
  // Verify the image is positioned correctly relative to the node
  const y = await nodeImage.getAttribute('y');
  expect(parseFloat(y)).toBeLessThan(0); // Image should be above the node text
});
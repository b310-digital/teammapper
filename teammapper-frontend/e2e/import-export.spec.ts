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
  await expect(page.locator('.map')).toBeVisible();
  
  // Wait for initial map to load (should have default root node)
  await page.waitForTimeout(500);
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Open import menu
  await page.locator('#menu-import').click();
  
  // Set up file chooser before clicking the JSON button
  const fileChooserPromise = page.waitForEvent('filechooser');
  
  // Click the JSON button which triggers the file input
  await page.getByText('JSON').click();
  
  // Handle the file chooser
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('./e2e/fake-data/test-map.json');
  
  // Verify the nodes from the imported file are present
  // The imported map should replace the current map, showing the imported nodes
  await expect(page.getByText('Root node')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('test')).toBeVisible({ timeout: 5000 });
  
  // Count all text elements that could be nodes (Root node + test)
  const rootNodeCount = await page.getByText('Root node').count();
  const testNodeCount = await page.getByText('test').count();
  
  // Verify we have the expected nodes
  expect(rootNodeCount).toBe(1);
  expect(testNodeCount).toBe(1);
});

test('imports Mermaid mindmap via modal', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  
  // Wait for initial map to load
  await page.waitForTimeout(500);
  await expect(page.getByText('Root node')).toBeVisible();
  
  // Open import menu
  await page.locator('#menu-import').click();
  
  // Click the MERMAID button which opens the dialog
  await page.getByText('MERMAID').click();
  
  // Wait for dialog to open
  await expect(page.locator('mat-dialog-container')).toBeVisible();
  
  // Enter Mermaid syntax in the textarea
  const mermaidSyntax = `mindmap
  root((Main Topic))
    Branch A
      ::icon(fa fa-book)
      Sub A1
      Sub A2
    Branch B
      Sub B1
      Sub B2`;
  
  await page.locator('textarea[matInput]').fill(mermaidSyntax);
  
  // Click the import button in the dialog
  await page.getByRole('button', { name: /import/i }).last().click();
  
  // Dialog might still be open, close it if needed
  const dialogVisible = await page.locator('mat-dialog-container').isVisible({ timeout: 5000 });
  if (dialogVisible) {
    // Click the close button
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible();
  }
  
  // Verify the nodes from the imported Mermaid are present
  await expect(page.getByText('Main Topic')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Branch A')).toBeVisible();
  await expect(page.getByText('Branch B')).toBeVisible();
  await expect(page.getByText('Sub A1')).toBeVisible();
  await expect(page.getByText('Sub B1')).toBeVisible();
});
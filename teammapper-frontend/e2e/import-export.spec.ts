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
  await expect(page.getByText('Root node')).toBeVisible({ timeout: 5000 });

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

  await expect(page.getByText('Root node')).toBeVisible({ timeout: 5000 });

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

  await page.getByRole('textbox', { name: 'mindmap ...' }).fill(mermaidSyntax);

  // Click the import button in the dialog
  await page
    .getByRole('button', { name: /import/i })
    .last()
    .click();

  // Dialog should close automatically on successful import
  await expect(page.locator('mat-dialog-container')).not.toBeVisible({
    timeout: 5000,
  });

  // Verify the nodes from the imported Mermaid are present
  await expect(page.getByText('Main Topic')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Branch A')).toBeVisible();
  await expect(page.getByText('Branch B')).toBeVisible();
  await expect(page.getByText('Sub A1')).toBeVisible();
  await expect(page.getByText('Sub B1')).toBeVisible();
});

test('imports Mermaid mindmap with different branch colors', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  await expect(page.getByText('Root node')).toBeVisible({ timeout: 5000 });

  // Open import menu
  await page.locator('#menu-import').click();

  // Click the MERMAID button which opens the dialog
  await page.getByText('MERMAID').click();

  // Wait for dialog to open
  await expect(page.locator('mat-dialog-container')).toBeVisible();

  // Enter a simple Mermaid syntax with 3 branches
  const mermaidSyntax = `mindmap
  root((Center))
    First Branch
      Branch of First Branch
    Second Branch
    Third Branch`;

  await page.getByRole('textbox', { name: 'mindmap ...' }).fill(mermaidSyntax);

  // Click the import button in the dialog
  await page
    .getByRole('button', { name: /import/i })
    .last()
    .click();

  // Dialog should close automatically on successful import
  await expect(page.locator('mat-dialog-container')).not.toBeVisible({
    timeout: 5000,
  });

  // Wait for the map to be rendered - use more specific selector for node text
  await expect(page.locator('div').filter({ hasText: /^Center$/ })).toBeVisible(
    { timeout: 5000 }
  );

  // Get the branch path elements (these are the curved lines connecting nodes)
  // Branch paths have IDs ending with '_branch'
  const branches = await page.locator('path[id$="_branch"]').all();

  // We should have 4 branches total (3 direct children + 1 grandchild)
  expect(branches.length).toBe(4);

  // Get colors of all branches
  const branchColors = new Set<string>([]);
  for (const branch of branches) {
    const fillColor = await branch.evaluate(
      el => window.getComputedStyle(el).fill
    );
    branchColors.add(fillColor);
  }

  // Verify that we have exactly 3 unique colors among the 4 branches
  expect(branchColors.size).toBe(3);
});

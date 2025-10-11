import { test, expect } from '@playwright/test';

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

test('adds a node and drags it - screenshot test', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();

  // Add a new node to the root
  await page.getByText('Root node').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Draggable Node');
  await page.locator('.map').click();

  // Wait for the node to be visible and stable
  const draggableNode = page.getByText('Draggable Node');
  await expect(draggableNode).toBeVisible();

  // Take a screenshot of the map after dragging
  await expect(page.locator('.map')).toHaveScreenshot('node-before-drag.png', {
    timeout: 500,
    maxDiffPixels: 150,
    animations: 'disabled',
    mask: [page.locator('.mat-toolbar')], // Mask the toolbar as it may vary
  });

  // Get the node's bounding box for dragging
  const nodeBoundingBox = await draggableNode.boundingBox({ timeout: 500 });
  if (!nodeBoundingBox) {
    throw new Error('Could not get bounding box for draggable node');
  }

  // Drag the node to a new position (move it 100px left and 50px to top)
  await page.mouse.move(
    nodeBoundingBox.x + nodeBoundingBox.width / 2,
    nodeBoundingBox.y + nodeBoundingBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    nodeBoundingBox.x + nodeBoundingBox.width / 2 - 100,
    nodeBoundingBox.y + nodeBoundingBox.height / 2 - 50,
    { steps: 10 }
  );
  await page.mouse.up();

  // Take a screenshot of the map after dragging
  await expect(page.locator('.map')).toHaveScreenshot('node-after-drag.png', {
    timeout: 500,
    maxDiffPixels: 150,
    animations: 'disabled',
    mask: [page.locator('.mat-toolbar')], // Mask the toolbar as it may vary
  });
});

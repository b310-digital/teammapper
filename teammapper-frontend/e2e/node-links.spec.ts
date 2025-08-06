import { test, expect } from '@playwright/test';

test('adds and removes links from nodes', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  // Add a new node
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type('Link Test Node');
  await page.locator('.map').click();

  // Select the node
  await page.getByText('Link Test Node').click();

  // Set up dialog handler before clicking the button
  page.once('dialog', async dialog => {
    await dialog.accept('https://teammapper.org');
  });

  // Click add link button - this will trigger the prompt
  await page.locator('#add-link-button').click();

  // Verify the link was added to the node
  const linkElement = page.locator(
    'svg a[href="https://teammapper.org"]'
  );
  await expect(linkElement).toBeVisible({ timeout: 5000 });

  // Also verify the link text element exists
  const linkText = page.locator('svg a > text.link-text');
  await expect(linkText).toBeVisible();

  // Now test removing the link
  // The remove button appears after adding a link
  await page.locator("button[title='Removes a link']").click();

  // Verify the link was removed
  await expect(linkElement).not.toBeVisible();
});

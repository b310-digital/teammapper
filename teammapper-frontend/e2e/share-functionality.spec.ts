import { test, expect } from '@playwright/test';

test('opens share dialog and verifies functionality', async ({
  page,
  context,
}) => {
  // Grant clipboard permissions for Chromium-based browsers
  // Note: WebKit doesn't support clipboard permissions via grantPermissions
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  } catch (e) {
    // Ignore permission errors for browsers that don't support it
  }

  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  // Click share button
  await page.locator('#share-button').click();

  // Wait for dialog to open and verify it's visible
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();

  // Verify dialog title
  const dialogTitle = dialog.locator('h2[mat-dialog-title]');
  await expect(dialogTitle).toBeVisible();

  // Verify QR code is visible
  const qrCodeCanvas = dialog.locator('#qr-code-canvas');
  await expect(qrCodeCanvas).toBeVisible();

  // Verify QR code has content (check for canvas or svg element)
  const qrCodeContent = qrCodeCanvas.locator('canvas, svg').first();
  await expect(qrCodeContent).toBeVisible({ timeout: 5000 });

  // Verify the link input field is visible and has a value
  const linkInput = dialog.locator('input[matInput][type="text"]');
  await expect(linkInput).toBeVisible();
  const linkValue = await linkInput.inputValue();
  expect(linkValue).toContain('/map/');

  // Test copy button functionality
  const copyButton = dialog
    .locator('button mat-icon:has-text("content_copy")')
    .first()
    .locator('..');
  await expect(copyButton).toBeVisible();

  // Click copy button
  await copyButton.click();

  // Verify clipboard content matches the link
  // Note: Reading clipboard in Playwright requires evaluating in page context
  const clipboardText = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      // Fallback for browsers that don't support clipboard API
      return null;
    }
  });

  if (clipboardText !== null) {
    expect(clipboardText).toBe(linkValue);
  }

  // Verify other dialog buttons are present
  const closeButton = dialog.locator('button:has-text("Close")');
  await expect(closeButton).toBeVisible();

  const downloadButton = dialog
    .locator('button mat-icon:has-text("file_download")')
    .locator('..');
  await expect(downloadButton).toBeVisible();

  const duplicateButton = dialog
    .locator('button mat-icon:has-text("content_copy")')
    .last()
    .locator('..');
  await expect(duplicateButton).toBeVisible();

  // Verify slide toggle for editable/view link
  const slideToggle = dialog.locator('mat-slide-toggle');
  await expect(slideToggle).toBeVisible();

  // Close the dialog
  await closeButton.click();

  // Verify dialog is closed
  await expect(dialog).not.toBeVisible();
});

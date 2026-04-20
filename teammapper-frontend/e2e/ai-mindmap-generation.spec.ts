import { test, expect } from '@playwright/test';

const mockMermaidResponse = `mindmap
  root((AI Generated))
    Branch One
    Branch Two`;

test('AI import dialog disables button during generation', async ({ page }) => {
  // Use a promise to control when the mock responds
  let resolveRoute: (() => void) | undefined;
  const routeReady = new Promise<void>(resolve => {
    resolveRoute = resolve;
  });

  await page.route('**/api/mermaid/create', async route => {
    // Signal that the route was intercepted, then wait before fulfilling
    resolveRoute?.();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 201,
      contentType: 'text/plain',
      body: mockMermaidResponse,
    });
  });

  // Ensure AI feature flag is enabled
  await page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.ai = true;
    await route.fulfill({ response, json });
  });

  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  // Open import menu and click AI
  await page.locator('#menu-import').click();
  await page.locator('#ai-upload').click();

  // Wait for dialog
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();

  // Fill in description
  await dialog.locator('textarea').fill('A mindmap about testing');

  // The generate button is the primary-colored button in the actions
  const generateButton = dialog.locator('button[color="primary"]');
  await expect(generateButton).toBeEnabled();

  // Click generate — don't await since we want to check intermediate state
  generateButton.click();

  // Wait for the request to be intercepted
  await routeReady;

  // Button should be disabled immediately during generation
  await expect(generateButton).toBeDisabled({ timeout: 500 });
});

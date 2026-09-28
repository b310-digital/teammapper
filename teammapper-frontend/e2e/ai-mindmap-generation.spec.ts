import { test, expect, Page } from '@playwright/test';

const mockMermaid = `mindmap
  root((AI Generated))
    Branch One
    Branch Two`;

const enableAi = (page: Page) =>
  page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.ai = true;
    json.systemSettings.info.aiModel = 'test-model';
    await route.fulfill({ response, json });
  });

const openAiDialog = async (page: Page) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  await page.locator('#menu-import').click();
  await page.locator('#ai-upload').click();
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();
  return dialog;
};

test('AI import sends the map shape and warns about a truncated map', async ({
  page,
}) => {
  let requestBody: unknown;
  await page.route('**/api/mermaid/create', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { mermaid: mockMermaid, truncated: true },
    });
  });
  await enableAi(page);

  const dialog = await openAiDialog(page);
  await expect(dialog).toContainText('test-model');
  await dialog.locator('textarea').fill('A mindmap about testing');
  await dialog.locator('button[color="primary"]').click();

  await expect(page.locator('.toast-warning')).toBeVisible();
  expect(requestBody).toMatchObject({ levels: 2, childrenPerNode: 4 });
});

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
      json: { mermaid: mockMermaid, truncated: false },
    });
  });
  await enableAi(page);

  const dialog = await openAiDialog(page);

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

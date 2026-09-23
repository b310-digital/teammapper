import { test, expect, Page } from '@playwright/test';

// The `Add a detached node` button writes a parentless node to the Y.Doc.
// Switch this helper to the add-tree button once the toolbar has one.
async function addParentlessNode(page: Page, name: string): Promise<void> {
  await page.locator("button[title='Add a detached node']").click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
}

test('two clients each add a parentless node and both render every tree', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();

  // The map URL carries the modification secret in its fragment, so the
  // second client opens the map with edit rights.
  const secondClientContext = await browser.newContext();
  try {
    const secondClient = await secondClientContext.newPage();
    await secondClient.goto(page.url());
    await expect(secondClient.getByText('Root node')).toBeVisible();

    await addParentlessNode(page, 'First client tree');
    await addParentlessNode(secondClient, 'Second client tree');

    for (const client of [page, secondClient]) {
      await expect(client.getByText('Root node')).toBeVisible();
      await expect(client.getByText('First client tree')).toBeVisible();
      await expect(client.getByText('Second client tree')).toBeVisible();
    }
  } finally {
    await secondClientContext.close();
  }
});

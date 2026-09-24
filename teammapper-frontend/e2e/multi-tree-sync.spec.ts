import { test, expect, Page } from '@playwright/test';

/** Adds a tree through the add-tree button, which writes a root to the Y.Doc. */
async function addTree(page: Page, name: string): Promise<void> {
  await page.locator('#add-tree-button').click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
}

test('two clients each add a tree and both render every tree', async ({
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

    await addTree(page, 'First client tree');
    await addTree(secondClient, 'Second client tree');

    for (const client of [page, secondClient]) {
      await expect(client.getByText('Root node')).toBeVisible();
      await expect(client.getByText('First client tree')).toBeVisible();
      await expect(client.getByText('Second client tree')).toBeVisible();
    }
  } finally {
    await secondClientContext.close();
  }
});

import { test, expect, Page } from '@playwright/test';

const NOTICE = 'This branch is protected. Release the protection to edit it.';

/** Adds a child to the node named `parent` and names it `name`. */
async function addChild(page: Page, parent: string, name: string) {
  await page.getByText(parent, { exact: true }).click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test('a peer sees a protected branch, cannot rename in it, and releases it', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  await addChild(page, 'Root node', 'Finished branch');
  await addChild(page, 'Finished branch', 'Finished child');

  await page.getByText('Finished branch', { exact: true }).click();
  await page.locator('#protect-branch-button').click();
  await expect(page.locator('.protected-icon')).toHaveCount(1);

  const peerContext = await browser.newContext();
  try {
    const peer = await peerContext.newPage();
    await peer.goto(page.url());
    await expect(peer.locator('.protected-icon')).toHaveCount(1);

    const child = peer.getByText('Finished child', { exact: true });
    await child.dblclick();
    await expect(peer.getByText(NOTICE)).toBeVisible();
    await expect(child).not.toHaveAttribute('contenteditable', 'true');

    await child.click();
    await peer.locator('#protect-branch-button').click();
    await expect(peer.locator('.protected-icon')).toHaveCount(0);
    await expect(page.locator('.protected-icon')).toHaveCount(0);

    await child.dblclick();
    await peer.keyboard.type(' edited');
    await peer.locator('.map').click();
    await expect(
      page.getByText('Finished child edited', { exact: true })
    ).toBeVisible();
  } finally {
    await peerContext.close();
  }
});

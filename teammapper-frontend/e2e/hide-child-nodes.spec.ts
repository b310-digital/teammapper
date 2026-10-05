import { test, expect } from '@playwright/test';
import { addChild, createMap } from './helpers';

// The toolbar refuses to hide the child nodes of a root, so the test hides the
// child nodes of a node below the main root.
test('hiding child nodes stays local to the client', async ({
  page,
  browser,
}) => {
  await createMap(page);
  await addChild(page, 'Root node', 'Branch');
  await addChild(page, 'Branch', 'First child');

  await page.getByText('Branch', { exact: true }).click();
  await page.locator('#hide-child-nodes-button').click();
  await expect(page.getByText('First child', { exact: true })).toBeHidden();

  // The map URL carries the modification secret in its fragment, so the
  // second client opens the map with edit rights.
  const secondClientContext = await browser.newContext();
  try {
    const secondClient = await secondClientContext.newPage();
    await secondClient.goto(page.url());
    await expect(
      secondClient.getByText('First child', { exact: true })
    ).toBeVisible();

    await addChild(secondClient, 'Branch', 'Second child');
    // The count proves the node reached the first client, which renders it
    // hidden, so the hidden check cannot pass on a node that never arrived.
    const secondChildInFirstClient = page.getByText('Second child', {
      exact: true,
    });
    await expect(secondChildInFirstClient).toHaveCount(1);
    await expect(secondChildInFirstClient).toBeHidden();
    await expect(
      secondClient.getByText('Second child', { exact: true })
    ).toBeVisible();
  } finally {
    await secondClientContext.close();
  }
});

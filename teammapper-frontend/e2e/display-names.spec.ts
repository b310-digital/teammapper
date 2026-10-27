import { test, expect, Locator, Page } from '@playwright/test';
import { createMap } from './helpers';

// A stuck action fails with its own call log instead of the test timeout.
test.use({ actionTimeout: 10_000 });

/** The entry of the client labelled `label`, own or remote. */
function clientLabelled(page: Page, label: string): Locator {
  return page.locator(
    `teammapper-client-colors-panel .client[aria-label="${label}"]`
  );
}

/** Types `name` into the settings field and closes the settings. */
async function setNameInSettings(page: Page, name: string) {
  await page.locator('#settings-button').click();
  const field = page.locator('input[name="displayName"]');
  await field.fill(name);
  await field.press('Tab');
  await page.locator('.close-button').click();
}

test('a name set in the settings shows in the client list and survives a reload', async ({
  page,
}) => {
  await createMap(page);

  await setNameInSettings(page, 'Vorname Test');

  await expect(clientLabelled(page, 'Vorname Test')).toHaveText('VT');

  await page.reload();
  await expect(page.getByText('Root node')).toBeVisible();
  await expect(clientLabelled(page, 'Vorname Test')).toHaveText('VT');
});

test('an emptied settings field shows the generic icon again', async ({
  page,
}) => {
  await createMap(page);
  await setNameInSettings(page, 'Vorname Test');

  await setNameInSettings(page, '');

  await expect(
    clientLabelled(page, 'Anonymous').locator('mat-icon')
  ).toHaveText('account_circle');
});

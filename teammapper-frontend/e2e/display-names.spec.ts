import { test, expect, Locator, Page } from '@playwright/test';
import { createMap } from './helpers';

// A stuck action fails with its own call log instead of the test timeout.
test.use({ actionTimeout: 10_000 });

/** The own client's entry in the client list. */
function ownClient(page: Page): Locator {
  return page.locator('teammapper-client-colors-panel button.client');
}

/** The entry of the client labelled `label`, own or remote. */
function clientLabelled(page: Page, label: string): Locator {
  return page.locator(
    `teammapper-client-colors-panel .client[aria-label="${label}"]`
  );
}

function displayNameDialog(page: Page): Locator {
  return page.locator('teammapper-dialog-display-name');
}

/** Opens the dialog from the own client icon and types `name`. */
async function typeDisplayName(page: Page, name: string) {
  await ownClient(page).click();
  const input = displayNameDialog(page).locator('input[name="displayName"]');
  await input.fill(name);
}

/**
 * Opens the settings dialog and waits for its open animation to end. The
 * dialog then focuses the close button, and a field filled before that focus
 * move loses the typed text on a slow machine.
 */
async function openSettings(page: Page) {
  await page.locator('#settings-button').click();
  await expect(page.locator('.close-button')).toBeFocused();
}

async function saveDisplayName(page: Page, name: string) {
  await typeDisplayName(page, name);
  await displayNameDialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(displayNameDialog(page)).toBeHidden();
}

test('a name set in one tab shows in another tab of the same browser', async ({
  page,
}) => {
  await createMap(page);
  const secondTab = await page.context().newPage();
  await secondTab.goto(page.url());
  await expect(secondTab.getByText('Root node')).toBeVisible();

  await saveDisplayName(page, 'Vorname Test');

  await expect(ownClient(secondTab)).toHaveText('VT');
  await expect(clientLabelled(page, 'Vorname Test')).toHaveCount(2);
});

test('Escape keeps the name', async ({ page }) => {
  await createMap(page);
  await saveDisplayName(page, 'Vorname Test');

  await typeDisplayName(page, 'Zweiter');
  await page.keyboard.press('Escape');
  await expect(displayNameDialog(page)).toBeHidden();

  await expect(ownClient(page)).toHaveAttribute('aria-label', 'Vorname Test');
});

test('the dialog opens on a view link and saves the name', async ({
  page,
  browser,
}) => {
  await createMap(page);
  const viewLink = page.url().split('#')[0];
  const viewer = await browser.newContext();
  try {
    const viewerPage = await viewer.newPage();
    await viewerPage.goto(viewLink);
    await expect(viewerPage.getByText('Root node')).toBeVisible();

    await saveDisplayName(viewerPage, 'Viewer Person');

    await expect(ownClient(viewerPage)).toHaveText('VP');
    await expect(clientLabelled(page, 'Viewer Person')).toHaveText('VP');
  } finally {
    await viewer.close();
  }
});

test('a name set in the settings shows in the client list and survives a reload', async ({
  page,
}) => {
  await createMap(page);

  await openSettings(page);
  const field = page.locator('input[name="displayName"]');
  await field.fill('Vorname Test');
  await expect(field).toHaveValue('Vorname Test');
  await field.press('Tab');
  await page.locator('.close-button').click();

  await expect(ownClient(page)).toHaveText('VT');

  await page.reload();
  await expect(page.getByText('Root node')).toBeVisible();
  await expect(ownClient(page)).toHaveText('VT');
});

test('an emptied settings field shows the generic icon again', async ({
  page,
}) => {
  await createMap(page);
  await saveDisplayName(page, 'Vorname Test');

  await openSettings(page);
  const field = page.locator('input[name="displayName"]');
  await expect(field).toHaveValue('Vorname Test');
  await field.fill('');
  await field.press('Tab');
  await page.locator('.close-button').click();

  await expect(ownClient(page)).toHaveAttribute('aria-label', 'Anonymous');
  await expect(ownClient(page).locator('mat-icon')).toHaveText(
    'account_circle'
  );
});

import { test, expect, Locator, Page } from '@playwright/test';
import path from 'path';

const SEARCH_RESULT = [{ _id: 6009 }, { _id: 6010 }];

const SERVER_MODE_URLS = {
  pictogramApiUrl: '/arasaac/api/pictograms',
  pictogramStaticUrl: '/arasaac/images/pictograms',
};

/** Enables pictograms and merges `urls` into the system settings URLs. */
async function enablePictograms(page: Page, urls = {}): Promise<void> {
  await page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.pictograms = true;
    json.systemSettings.urls = { ...json.systemSettings.urls, ...urls };
    await route.fulfill({ response, json });
  });
}

/** Enables pictograms and points the app at the backend's two endpoints. */
async function useServerMode(page: Page): Promise<void> {
  await enablePictograms(page, SERVER_MODE_URLS);
}

async function openPictogramDialog(page: Page): Promise<Locator> {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();
  await page.locator('button:has(mat-icon:has-text("nature_people"))').click();
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function searchPictograms(dialog: Locator, term: string): Promise<void> {
  await dialog.locator('input[matInput]').fill(term);
  await dialog.locator('button:has(mat-icon:has-text("search"))').click();
}

test('pictogram search results appear immediately', async ({ page }) => {
  await enablePictograms(page);
  await page.route('**/api.arasaac.org/v1/pictograms/*/search/*', route =>
    route.fulfill({ json: SEARCH_RESULT })
  );
  const dialog = await openPictogramDialog(page);

  await searchPictograms(dialog, 'dog');

  await expect(dialog.locator('mat-grid-tile img')).toHaveCount(2, {
    timeout: 5000,
  });
});

const LOGO_PATH = path.join(
  __dirname,
  '..',
  'src',
  'assets',
  'icons',
  'icon-72x72.png'
);

/**
 * Answers the backend's two pictogram endpoints in the browser: a search for
 * "fail" gets a 502, any other search two pictograms, and every image the logo.
 */
async function mockServerEndpoints(page: Page): Promise<void> {
  await page.route('**/arasaac/api/pictograms/*/search/*', async route => {
    const term = route.request().url().split('/').pop();
    if (term === 'fail') {
      await route.fulfill({ status: 502, json: { message: 'Bad Gateway' } });
      return;
    }
    await route.fulfill({ json: SEARCH_RESULT });
  });
  await page.route('**/arasaac/images/pictograms/**', route =>
    route.fulfill({ contentType: 'image/png', path: LOGO_PATH })
  );
}

test('inserts a pictogram through the server endpoints @server', async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  page.on('request', request => requestedUrls.push(request.url()));
  await useServerMode(page);
  await mockServerEndpoints(page);
  const dialog = await openPictogramDialog(page);

  await searchPictograms(dialog, 'dog');
  const images = dialog.locator('mat-grid-tile img');
  await expect(images).toHaveCount(2, { timeout: 5000 });
  await images.first().click();

  await expect(page.locator('svg image').first()).toBeVisible({
    timeout: 5000,
  });
  const hosts = requestedUrls.map(url => new URL(url).hostname);
  const arasaacHosts = hosts.filter(
    host => host === 'arasaac.org' || host.endsWith('.arasaac.org')
  );
  expect(arasaacHosts).toEqual([]);
});

test('shows an error toast when the pictogram search fails @server', async ({
  page,
}) => {
  await useServerMode(page);
  await mockServerEndpoints(page);
  const dialog = await openPictogramDialog(page);

  await searchPictograms(dialog, 'fail');

  await expect(page.locator('.toast-error')).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('mat-grid-tile img')).toHaveCount(0);
});

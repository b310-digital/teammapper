import { test, expect, Locator, Page } from '@playwright/test';
import path from 'path';

const mockPictogramResponse = [
  {
    _id: 6009,
    keywords: [{ keyword: 'dog', type: 1, hasLocation: false }],
    categories: ['animals'],
    synsets: ['dog'],
    tags: ['animal'],
    schematic: false,
    sex: false,
    violence: false,
    aac: false,
    aacColor: false,
    skin: false,
    hair: false,
    downloads: 100,
    created: '2020-01-01T00:00:00.000Z',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  },
  {
    _id: 6010,
    keywords: [{ keyword: 'puppy', type: 1, hasLocation: false }],
    categories: ['animals'],
    synsets: ['puppy'],
    tags: ['animal'],
    schematic: false,
    sex: false,
    violence: false,
    aac: false,
    aacColor: false,
    skin: false,
    hair: false,
    downloads: 50,
    created: '2020-01-01T00:00:00.000Z',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  },
];

test('pictogram search results appear immediately', async ({ page }) => {
  // Ensure pictograms feature flag is enabled
  await page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.pictograms = true;
    await route.fulfill({ response, json });
  });

  // Mock the ARASAAC pictogram search API
  await page.route(
    '**/api.arasaac.org/v1/pictograms/*/search/*',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPictogramResponse),
      });
    }
  );

  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.locator('.map')).toBeVisible();

  // Click the pictogram button in the toolbar
  await page.locator('button:has(mat-icon:has-text("nature_people"))').click();

  // Wait for dialog
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();

  // Type search term and click search button
  await dialog.locator('input[matInput]').fill('dog');
  await dialog.locator('button:has(mat-icon:has-text("search"))').click();

  // Pictogram images should appear immediately without additional interaction
  const images = dialog.locator('mat-grid-tile img');
  await expect(images).toHaveCount(2, { timeout: 5000 });
});

const SERVER_MODE_URLS = {
  pictogramApiUrl: '/arasaac/api/pictograms',
  pictogramStaticUrl: '/arasaac/images/pictograms',
};

/** Enables pictograms and points the app at the backend's two endpoints. */
async function useServerMode(page: Page): Promise<void> {
  await page.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.pictograms = true;
    json.systemSettings.urls = {
      ...json.systemSettings.urls,
      ...SERVER_MODE_URLS,
    };
    await route.fulfill({ response, json });
  });
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
    await route.fulfill({ json: [{ _id: 6009 }, { _id: 6010 }] });
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

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import {
  addChild,
  arrows,
  connectWithArrow,
  createMap,
  createMapWithTwoChildren,
} from '../e2e/helpers';

const IMAGE_PATH = path.join(
  __dirname,
  '..',
  'e2e',
  'fake-data',
  'radial-tree.png'
);
const MAP_FILE_PATH = path.join(
  __dirname,
  '..',
  'e2e',
  'fake-data',
  'test-map.json'
);

/** The arrows flag ships off and gates the connect button. */
async function enableArrows(page: Page) {
  await page.route('**/settings.offline.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.systemSettings.featureFlags.arrows = true;
    await route.fulfill({ response, json });
  });
}

/**
 * Reloads the page once the last edit is stored. y-indexeddb writes each edit
 * in an IndexedDB transaction of its own, and Chromium drops a transaction
 * still running when the page unloads, so a reload right after an edit can
 * lose it. The map shows no sign of a finished write to wait for.
 */
async function reloadOnceStored(page: Page) {
  await page.waitForTimeout(500);
  await page.reload();
}

/** Selects the node named `name` and gives it the test image. */
async function addImage(page: Page, name: string) {
  await page.getByText(name, { exact: true }).click();
  await page.locator('#image-upload').setInputFiles(IMAGE_PATH);
  await expect(page.locator('svg image')).toHaveCount(1);
}

/** Imports the JSON map file through the toolbar. */
async function importJson(page: Page) {
  await page.locator('#menu-import').click();
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByText('JSON').click();
  await (await fileChooser).setFiles(MAP_FILE_PATH);
  await expect(page.getByText('test', { exact: true })).toBeVisible();
}

/** Exports the map through the toolbar button titled `title`. */
async function exportMap(page: Page, title: string) {
  await page.locator('#menu-export').click();
  const download = page.waitForEvent('download');
  await page.locator(`button[title='${title}']`).click();
  expect(await (await download).failure()).toBeNull();
}

/** Records the URL of every request and websocket the page opens. */
function recordTraffic(page: Page): URL[] {
  const urls: URL[] = [];
  page.on('request', request => urls.push(new URL(request.url())));
  page.on('websocket', socket => urls.push(new URL(socket.url())));
  return urls;
}

/**
 * True when `url` leaves the site or reaches the server's endpoints. The
 * browser answers a data: or blob: URL itself.
 */
function needsServer(url: URL, siteHost: string): boolean {
  if (url.protocol === 'data:' || url.protocol === 'blob:') return false;
  return url.host !== siteHost || /^\/(api|yjs)(\/|$)/.test(url.pathname);
}

test('keeps edits, a node image and an arrow across a reload', async ({
  page,
}) => {
  await enableArrows(page);
  await createMapWithTwoChildren(page);
  await addChild(page, 'Alpha', 'Alpha child');
  await connectWithArrow(page, 'Alpha', 'Beta');
  await expect(arrows(page)).toHaveCount(1);
  await addImage(page, 'Beta');

  await reloadOnceStored(page);

  await expect(page.getByText('Alpha child', { exact: true })).toBeVisible();
  await expect(page.getByText('Beta', { exact: true })).toBeVisible();
  await expect(arrows(page)).toHaveCount(1);
  await expect(page.locator('svg image')).toHaveCount(1);
  await expect(page.locator('svg image')).toHaveAttribute('href', /^blob:/);
});

test('keeps the edits of two tabs on the same map', async ({ page }) => {
  await createMap(page);
  const secondTab = await page.context().newPage();
  await secondTab.goto(page.url());
  await expect(secondTab.locator('#add-tree-button')).toBeEnabled();

  await addChild(page, 'Root node', 'From the first tab');
  await addChild(secondTab, 'Root node', 'From the second tab');

  for (const tab of [page, secondTab]) {
    await reloadOnceStored(tab);
    await expect(tab.getByText('From the first tab')).toBeVisible();
    await expect(tab.getByText('From the second tab')).toBeVisible();
  }
});

test('stops an open tab once a later build updated the stored maps', async ({
  page,
}) => {
  await createMap(page);
  await expect(page.locator('#add-tree-button')).toBeEnabled();
  const laterBuild = await page.context().newPage();
  await laterBuild.goto(page.url());

  // A later build announces its format number on first access. The channel
  // name follows CHANNEL_NAME in format-channel.ts, the text below follows
  // BROWSER_STORAGE_UPDATED in en.json.
  await laterBuild.evaluate(() => {
    const channel = new BroadcastChannel('teammapper-offline-format');
    channel.postMessage({ formatNumber: 2 });
    channel.close();
  });

  await expect(
    page.getByText('This tab saves no more changes', { exact: false })
  ).toBeVisible();
  await expect(page.locator('#add-tree-button')).toBeDisabled();
});

test('requests nothing from a server', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The offline suite needs a base URL');
  const traffic = recordTraffic(page);

  await createMapWithTwoChildren(page);
  await addImage(page, 'Alpha');
  await reloadOnceStored(page);
  await expect(page.getByText('Beta', { exact: true })).toBeVisible();
  await importJson(page);
  await exportMap(page, 'Exports the map as JSON');
  await exportMap(page, 'Exports the map as PNG');

  expect(traffic.length).toBeGreaterThan(0);
  const siteHost = new URL(baseURL).host;
  expect(
    traffic.filter(url => needsServer(url, siteHost)).map(url => url.href)
  ).toEqual([]);
});

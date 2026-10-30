import { test as base, expect, Page } from '@playwright/test';
import { createMap } from '../e2e/helpers';
import { PRODUCTION_BUILD_PORT } from '../playwright.offline.config';

/** Points every page at the static server of the production offline build. */
const test = base.extend({
  baseURL: async ({ baseURL }, use) => {
    if (!baseURL) throw new Error('The offline suite needs a base URL');
    const url = new URL(baseURL);
    url.port = String(PRODUCTION_BUILD_PORT);
    await use(url.href);
  },
});

interface WorkerManifest {
  assetGroups: { name: string; urls: string[] }[];
}

/** Counts the files the worker's cache of the `app` asset group holds. */
function countCachedAppFiles(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter(name =>
      name.endsWith(':assets:app:cache')
    );
    const counts = await Promise.all(
      names.map(async name => (await (await caches.open(name)).keys()).length)
    );
    return counts.reduce((sum, count) => sum + count, 0);
  });
}

/**
 * Waits until the service worker has stored every file it prefetches. The
 * worker caches the files after it activates, and `ready` resolves at
 * activation, before the cache is complete.
 */
async function waitForCachedSite(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  const manifest: WorkerManifest = await (
    await page.request.get('ngsw.json')
  ).json();
  const appFiles = manifest.assetGroups.find(group => group.name === 'app');
  if (!appFiles) throw new Error('ngsw.json lists no app asset group');
  await expect
    .poll(() => countCachedAppFiles(page), { timeout: 60 * 1000 })
    .toBe(appFiles.urls.length);
}

test('loads the site and creates a map without a network', async ({ page }) => {
  // The worker registers once the app is stable, or after 30 seconds.
  test.setTimeout(120 * 1000);
  await page.goto('/');
  // CI reaches the site on localhost, so a skip there would hide a failure.
  test.skip(
    !process.env.CI && !(await page.evaluate(() => window.isSecureContext)),
    'A browser registers a service worker in a secure context only'
  );
  await waitForCachedSite(page);

  await page.context().setOffline(true);
  await page.reload();

  await createMap(page);
});

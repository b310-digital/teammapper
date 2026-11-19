import { test, expect, APIResponse, Page } from '@playwright/test';
import path from 'path';
import type { ClientMap } from '@teammapper/shared';

const IMAGE_PATH = path.join(__dirname, 'fake-data', 'radial-tree.png');
const IMAGE_URL = /api\/maps\/[0-9a-f-]{36}\/images\/[0-9a-f-]{36}$/;
// Twice the Yjs UndoManager's default captureTimeout of 500 ms.
const UNDO_CAPTURE_WINDOW_MS = 1000;

/** Creates a map with one child node and selects it. */
async function createMapWithNode(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await page.getByText(name).click();
}

async function uploadImage(page: Page): Promise<void> {
  await page.locator('#image-upload').setInputFiles(IMAGE_PATH);
}

test('adds image to node @server', async ({ page }) => {
  await createMapWithNode(page, 'Image Test Node');

  const imageInput = page.locator('#image-upload');
  await expect(imageInput).toHaveAttribute('type', 'file');
  await expect(imageInput).toHaveAttribute(
    'accept',
    'image/png, image/jpeg, image/gif, image/webp'
  );

  await uploadImage(page);

  const nodeImage = page.locator('svg image').first();
  await expect(nodeImage).toBeVisible({ timeout: 5000 });

  // The node holds a reference, so the image loads from the map's endpoint
  // and no image bytes sit in the node.
  const href = (await nodeImage.getAttribute('href')) ?? '';
  expect(href).toMatch(IMAGE_URL);
  // The page resolves the relative href against its <base href>.
  const baseUri = await page.evaluate(() => document.baseURI);
  const response = await page.request.get(new URL(href, baseUri).href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/jpeg');

  const width = await nodeImage.getAttribute('width');
  const height = await nodeImage.getAttribute('height');
  expect(parseFloat(width ?? '')).toBeGreaterThan(0);
  expect(parseFloat(height ?? '')).toBeGreaterThan(0);

  const y = await nodeImage.getAttribute('y');
  expect(parseFloat(y ?? '')).toBeLessThan(0); // above the node text
});

test('a second client sees the uploaded image @server', async ({
  page,
  browser,
}) => {
  await createMapWithNode(page, 'Shared Image Node');

  const secondClientContext = await browser.newContext();
  try {
    const secondClient = await secondClientContext.newPage();
    await secondClient.goto(page.url());
    await expect(secondClient.getByText('Shared Image Node')).toBeVisible();

    await uploadImage(page);

    const image = secondClient.locator('svg image').first();
    await expect(image).toBeVisible({ timeout: 5000 });
    expect((await image.getAttribute('href')) ?? '').toMatch(IMAGE_URL);
  } finally {
    await secondClientContext.close();
  }
});

function mapIdOf(url: string): string {
  return new URL(url).pathname.split('/')[2];
}

/** Adds a node under the root, types its name and selects it. */
async function addNodeToRoot(page: Page, name: string): Promise<void> {
  await page.locator('.map').click();
  await page.locator("button[title='Adds a node']").click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await page.getByText(name).click();
}

/** Requests a path the page links to, resolved against its <base href>. */
async function getFromPage(page: Page, path: string): Promise<APIResponse> {
  const baseUri = await page.evaluate(() => document.baseURI);
  return page.request.get(new URL(path, baseUri).href);
}

/** The sorted image references of the map as the server stored them. */
async function storedImageReferences(
  page: Page,
  mapId: string
): Promise<string[]> {
  const response = await getFromPage(page, `api/maps/${mapId}`);
  const map: ClientMap = await response.json();
  return map.data
    .map(node => node.image?.src ?? '')
    .filter(src => src.startsWith('image:'))
    .sort();
}

test('a duplicated map shows every image of the original @server', async ({
  page,
}) => {
  await createMapWithNode(page, 'First Image Node');
  await uploadImage(page);
  await expect(page.locator('svg image')).toHaveCount(1, { timeout: 5000 });
  await addNodeToRoot(page, 'Second Image Node');
  await uploadImage(page);
  await expect(page.locator('svg image')).toHaveCount(2, { timeout: 5000 });

  const originalId = mapIdOf(page.url());
  // Duplication copies the stored map, and the server stores edits after a
  // pause, so wait until it stored both images.
  await expect
    .poll(() => storedImageReferences(page, originalId), { timeout: 15000 })
    .toHaveLength(2);
  const originalImages = await storedImageReferences(page, originalId);
  await page.locator('#share-button').click();
  await page
    .locator('mat-dialog-container button mat-icon:has-text("content_copy")')
    .last()
    .click();
  // The duplicate button loads the copy in the same page.
  await page.waitForURL(url => mapIdOf(url.href) !== originalId);

  const copyId = mapIdOf(page.url());
  expect(copyId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await storedImageReferences(page, copyId)).toEqual(originalImages);
  const images = page.locator('svg image');
  await expect(images).toHaveCount(2, { timeout: 5000 });
  await expect(images.first()).toBeVisible();

  for (const image of await images.all()) {
    const href = (await image.getAttribute('href')) ?? '';
    expect(href).toMatch(IMAGE_URL);
    expect(href).toContain(`api/maps/${copyId}/images/`);
    const response = await getFromPage(page, href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  }
});

test('undo of a node delete restores its image', async ({ page }) => {
  await createMapWithNode(page, 'Undo Image Node');
  // The undo manager merges changes that follow each other within its
  // capture window, so each step waits it out to stay a step of its own.
  await page.waitForTimeout(UNDO_CAPTURE_WINDOW_MS);
  await uploadImage(page);
  await expect(page.locator('svg image').first()).toBeVisible({
    timeout: 5000,
  });
  await page.waitForTimeout(UNDO_CAPTURE_WINDOW_MS);

  await page.locator('#floating-remove-node').click();
  await expect(page.getByText('Undo Image Node')).toHaveCount(0);
  await expect(page.locator('svg image')).toHaveCount(0);

  await page.locator("button[title='Undoes the last change']").click();

  await expect(page.getByText('Undo Image Node')).toBeVisible();
  await expect(page.locator('svg image').first()).toBeVisible({
    timeout: 5000,
  });
});

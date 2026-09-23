import { test, expect, Page } from '@playwright/test';
import type { ExportNodeProperties } from '@teammapper/shared';
import type { Readable } from 'stream';
import { enableMultiTree } from './helpers/feature-flags';

/** Adds a child to the node named `parent` and names it `name`. */
async function addChild(page: Page, parent: string, name: string) {
  await page.getByText(parent, { exact: true }).click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

/** Exports the map as JSON through the toolbar and parses the download. */
async function exportNodes(page: Page): Promise<ExportNodeProperties[]> {
  await page.locator('#menu-export').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator("button[title='Exports the map as JSON']").click();
  const download = await downloadPromise;
  return JSON.parse(await readStream(await download.createReadStream()));
}

/** Opens a new map with the `multiTree` flag on. */
async function createMap(page: Page) {
  await enableMultiTree(page.context());
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
}

/** Adds a tree through the toolbar and names its root `name`. */
async function addTree(page: Page, name: string) {
  await page.locator('#add-tree-button').click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * Clicks the map background near its left edge, clear of every node and of
 * the toolbar, which leaves nothing selected.
 */
async function deselect(page: Page) {
  const background = page.locator('.map-background');
  const box = await background.boundingBox();
  const y = (box?.height ?? 400) / 2;
  await background.click({ position: { x: 20, y } });
  await expect(page.locator('#copy-node-button')).toBeDisabled();
}

test('creates a tree and adds two levels of children to it', async ({
  page,
}) => {
  await createMap(page);
  await addTree(page, 'Second tree');

  await addChild(page, 'Second tree', 'Tree child');
  await addChild(page, 'Tree child', 'Tree grandchild');

  const nodes = await exportNodes(page);
  const byName = (name: string) => nodes.find(node => node.name === name);
  const secondRoot = byName('Second tree');

  expect(secondRoot).toBeDefined();
  // The JSON export writes an empty string as the parent of a root.
  expect(secondRoot?.parent).toBe('');
  expect(secondRoot?.isRoot).toBe(false);
  expect(byName('Tree child')?.parent).toBe(secondRoot?.id);
  expect(byName('Tree grandchild')?.parent).toBe(byName('Tree child')?.id);
  expect(byName('Root node')?.isRoot).toBe(true);
});

test('pastes a copied tree as a second tree with nothing selected', async ({
  page,
}) => {
  await createMap(page);
  await addTree(page, 'Copied tree');
  await addChild(page, 'Copied tree', 'Copied child');

  await page.getByText('Copied tree', { exact: true }).click();
  await page.locator('#copy-node-button').click();
  await deselect(page);
  await page.locator('#paste-node-button').click();

  await expect(page.getByText('Copied tree', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Copied child', { exact: true })).toHaveCount(2);

  const nodes = await exportNodes(page);
  const roots = nodes.filter(node => node.name === 'Copied tree');
  const children = nodes.filter(node => node.name === 'Copied child');

  expect(roots.map(root => root.parent)).toEqual(['', '']);
  expect(roots.map(root => root.isRoot)).toEqual([false, false]);
  expect(children.map(child => child.parent).sort()).toEqual(
    roots.map(root => root.id).sort()
  );
});

test('deletes a second tree and keeps the main tree', async ({ page }) => {
  await createMap(page);
  await addChild(page, 'Root node', 'Main child');
  await addTree(page, 'Doomed tree');
  await addChild(page, 'Doomed tree', 'Doomed child');

  await page.getByText('Doomed tree', { exact: true }).click();
  await page.locator('#floating-remove-node').click();

  await expect(page.getByText('Doomed tree', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Doomed child', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Root node', { exact: true })).toBeVisible();
  await expect(page.getByText('Main child', { exact: true })).toBeVisible();

  const names = (await exportNodes(page)).map(node => node.name).sort();
  expect(names).toEqual(['Main child', 'Root node']);
});

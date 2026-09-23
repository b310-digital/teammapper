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

test('creates a tree and adds two levels of children to it', async ({
  page,
}) => {
  await enableMultiTree(page.context());
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();

  await page.locator('#add-tree-button').click();
  await page.keyboard.type('Second tree');
  await page.locator('.map').click();
  await expect(page.getByText('Second tree', { exact: true })).toBeVisible();

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

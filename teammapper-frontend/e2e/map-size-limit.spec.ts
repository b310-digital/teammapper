import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { createMap } from './helpers';

// This spec needs the server, so the offline config does not list it.

const NODE_COUNT = 15;
const IMAGE_SRC_LENGTH = 190_000;
/** Longer than YJS_MESSAGE_WINDOW_MS (10 s), so the byte budgets reset. */
const MESSAGE_WINDOW_WAIT_MS = 11_000;

test.use({ actionTimeout: 10_000 });

/**
 * Builds a version 2 map file of about 2.85 MB from text: a root and 14
 * children, each with a long non-raster data URL as image source. Each call
 * uses fresh node ids, so a second import adds data instead of overwriting.
 */
function buildMapFile(label: string): string {
  const rootId = randomUUID();
  const node = (name: string, parent: string | null, isRoot: boolean) => ({
    id: isRoot ? rootId : randomUUID(),
    parent,
    k: 1,
    name,
    coordinates: { x: 0, y: 0 },
    image: { src: 'data:text/plain,' + 'a'.repeat(IMAGE_SRC_LENGTH), size: 60 },
    colors: { name: '#787878', background: '#f0f6f5', branch: '' },
    font: { size: 16, style: 'normal', weight: 'normal' },
    link: { href: '' },
    protected: false,
    isRoot,
  });
  const children = Array.from({ length: NODE_COUNT - 1 }, (_, index) =>
    node(`${label} child ${index}`, rootId, false)
  );
  return JSON.stringify({
    version: 2,
    nodes: [node(`${label} root`, null, true), ...children],
    arrows: [],
  });
}

/** Imports the map file through the JSON entry of the import menu. */
async function importMapFile(page: Page, label: string) {
  await page.locator('#menu-import').click();
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByText('JSON').click();
  await (
    await fileChooser
  ).setFiles({
    name: `${label}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(buildMapFile(label), 'utf-8'),
  });
}

test('a map above the size limit turns read-only for the sender and resets the peer', async ({
  page: sender,
  browser,
}) => {
  test.setTimeout(90_000);
  await createMap(sender);

  const peerContext = await browser.newContext();
  try {
    const peer = await peerContext.newPage();
    await peer.goto(sender.url());
    await expect(peer.getByText('Root node')).toBeVisible();
    await expect(peer.locator('#add-tree-button')).toBeEnabled();

    // File A stays below 5 MiB, so the peer receives it.
    await importMapFile(sender, 'File A');
    await expect(sender.locator('g.node')).toHaveCount(NODE_COUNT, {
      timeout: 20_000,
    });
    await expect(peer.locator('g.node')).toHaveCount(NODE_COUNT, {
      timeout: 20_000,
    });

    await sender.waitForTimeout(MESSAGE_WINDOW_WAIT_MS);

    // File B pushes the stored map past 5 MiB.
    await importMapFile(sender, 'File B');
    await expect(sender.getByText(/reached its size limit/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(sender.locator('#add-tree-button')).toBeDisabled();
    await sender.screenshot({ path: 'playwright/output/map-too-large.png' });

    await expect(peer.getByText(/reloaded its last saved state/)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await peerContext.close();
  }
});

import { test, expect, Locator, Page } from '@playwright/test';
import path from 'path';
import { addChild, createMap } from './helpers';

const IMPORT_FIXTURE = path.join(__dirname, 'fake-data', 'test-map.json');

/** The third preset color of the color picker, #f44336. */
const RED_PRESET_INDEX = 2;
const RED = 'rgb(244, 67, 54)';
const DEFAULT_BACKGROUND = 'rgb(245, 245, 245)';

const PIXEL_TOLERANCE = 5;

// A stuck action fails with its own call log instead of the test timeout.
test.use({ actionTimeout: 10_000 });

/** The drawn node group that shows `name`. */
function nodeOf(page: Page, name: string): Locator {
  return page.locator('g.node').filter({ hasText: name });
}

function backgroundOf(page: Page, name: string): Locator {
  return nodeOf(page, name).locator('path.background');
}

/** Opens the map from the editor link in a second browser context. */
async function openSecondClient(
  page: Page,
  newPage: () => Promise<Page>
): Promise<Page> {
  const secondClient = await newPage();
  await secondClient.goto(page.url());
  await expect(secondClient.getByText('Root node')).toBeVisible();
  await expect(secondClient.locator('#add-tree-button')).toBeEnabled();
  return secondClient;
}

/** Renames a node through its inline name editor. */
async function renameNode(page: Page, from: string, to: string) {
  await nodeOf(page, from).dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(to);
  await page.locator('.map').click();
  await expect(nodeOf(page, to)).toBeVisible();
}

/** Drags the node by the offset with the mouse. */
async function dragNode(page: Page, name: string, dx: number, dy: number) {
  const box = await nodeOf(page, name).boundingBox();
  if (!box) throw new Error(`No bounding box for node ${name}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

/**
 * The offset of the node from the root, in screen pixels. The offset stays
 * equal across clients whose viewports pan differently.
 */
async function offsetFromRoot(page: Page, name: string) {
  const node = await nodeOf(page, name).boundingBox();
  const root = await nodeOf(page, 'Root node').boundingBox();
  if (!node || !root) throw new Error(`No bounding box for ${name} or root`);
  return {
    x: node.x + node.width / 2 - (root.x + root.width / 2),
    y: node.y + node.height / 2 - (root.y + root.height / 2),
  };
}

/** Picks the red preset as the background color of the node. */
async function colorNodeRed(page: Page, name: string) {
  await nodeOf(page, name).click();
  await page.locator('input.background-color').click();
  await page
    .locator('.color-picker .preset-color')
    .nth(RED_PRESET_INDEX)
    .click();
  // While the picker is open, the color panel lays a backdrop over the map. A
  // click on it closes the picker.
  await page
    .locator('teammapper-colors-panel .background')
    .click({ position: { x: 300, y: 150 } });
  await expect(page.locator('.color-picker')).toBeHidden();
}

test('two clients on one map see each other edit, move, color, undo, remove and import', async ({
  page: clientA,
  browser,
}) => {
  await createMap(clientA);

  const contextB = await browser.newContext();
  try {
    const clientB = await openSecondClient(clientA, () => contextB.newPage());

    // 1. A adds a child node and names it.
    await addChild(clientA, 'Root node', 'Child from A');
    await expect(nodeOf(clientB, 'Child from A')).toBeVisible();

    // 2. B renames the node.
    await renameNode(clientB, 'Child from A', 'Renamed by B');
    await expect(nodeOf(clientA, 'Renamed by B')).toBeVisible();
    await expect(nodeOf(clientA, 'Child from A')).toHaveCount(0);

    // 3. A drags the node, and B shows it at the same place relative to the root.
    const before = await offsetFromRoot(clientA, 'Renamed by B');
    await dragNode(clientA, 'Renamed by B', -150, 100);
    await expect
      .poll(async () => (await offsetFromRoot(clientA, 'Renamed by B')).x)
      .toBeLessThan(before.x - 100);
    const dragged = await offsetFromRoot(clientA, 'Renamed by B');
    await expect
      .poll(async () => {
        const seen = await offsetFromRoot(clientB, 'Renamed by B');
        return Math.max(
          Math.abs(seen.x - dragged.x),
          Math.abs(seen.y - dragged.y)
        );
      })
      .toBeLessThan(PIXEL_TOLERANCE);

    // 4. A changes the background color, and B shows it.
    await expect(backgroundOf(clientB, 'Renamed by B')).toHaveCSS(
      'fill',
      DEFAULT_BACKGROUND
    );
    await colorNodeRed(clientA, 'Renamed by B');
    await expect(backgroundOf(clientA, 'Renamed by B')).toHaveCSS('fill', RED);
    await expect(backgroundOf(clientB, 'Renamed by B')).toHaveCSS('fill', RED);

    // 5. A undoes the color change and then redoes it, and B follows both.
    await clientA.locator('#undo-button').click();
    await expect(backgroundOf(clientB, 'Renamed by B')).toHaveCSS(
      'fill',
      DEFAULT_BACKGROUND
    );
    await clientA.locator('#redo-button').click();
    await expect(backgroundOf(clientB, 'Renamed by B')).toHaveCSS('fill', RED);

    // 6. A removes the node, and B loses it. A undoes, and B gets it back.
    await nodeOf(clientA, 'Renamed by B').click();
    await clientA.locator('#floating-remove-node').click();
    await expect(nodeOf(clientB, 'Renamed by B')).toHaveCount(0);
    await clientA.locator('#undo-button').click();
    await expect(nodeOf(clientB, 'Renamed by B')).toBeVisible();

    // 7. A imports a JSON map, and B shows its nodes and the import toast.
    await clientA.locator('#menu-import').click();
    const fileChooser = clientA.waitForEvent('filechooser');
    await clientA.getByText('JSON').click();
    await (await fileChooser).setFiles(IMPORT_FIXTURE);
    await expect(
      clientB.getByText('Mindmap successfully imported!')
    ).toBeVisible();
    await expect(clientB.getByText('test', { exact: true })).toBeVisible();
    await expect(clientB.getByText('Root node')).toBeVisible();
    await expect(nodeOf(clientB, 'Renamed by B')).toHaveCount(0);
  } finally {
    await contextB.close();
  }
});

import { expect, Locator, Page } from '@playwright/test';

/**
 * Opens a new map and waits until it accepts edits. The add tree button turns
 * enabled once edit mode is on, and needs no selected node.
 */
export async function createMap(page: Page) {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  await expect(page.locator('#add-tree-button')).toBeEnabled();
}

/**
 * Adds a child to the node named `parent` through the floating add button
 * and names it `name`.
 */
export async function addChild(page: Page, parent: string, name: string) {
  await page.getByText(parent, { exact: true }).click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type(name);
  await page.locator('.map').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/** Every arrow the map draws. */
export function arrows(page: Page): Locator {
  return page.locator('g.arrow');
}

/**
 * Creates an arrow from the node named `source` to the node named `target`:
 * select the source, press the "connect with arrow" button, click the target.
 */
export async function connectWithArrow(
  page: Page,
  source: string,
  target: string
) {
  await page.getByText(source, { exact: true }).click();
  await page.locator('#arrow-mode-button').click();
  await page.getByText(target, { exact: true }).click();
}

/**
 * Clicks the arrow at the middle of its path. The hit path is a thin curve,
 * so a click on its bounding box center would miss it.
 */
export async function clickArrow(page: Page, index = 0) {
  const hit = arrows(page).nth(index).locator('path.arrow-hit');
  const point = await hit.evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('The arrow has no screen matrix');
    const middle = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(middle.x, middle.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
}

/**
 * Waits until the undo manager ends its current undo step. Y.UndoManager
 * merges local edits less than 500 ms apart into one step, so without the
 * wait an undo reverts the edits before the one the test means to undo.
 */
export async function endUndoStep(page: Page) {
  await page.waitForTimeout(600);
}

/**
 * Creates a map with the children `Alpha` and `Beta` under the root and no
 * arrow.
 */
export async function createMapWithTwoChildren(page: Page) {
  await createMap(page);
  await addChild(page, 'Root node', 'Alpha');
  await addChild(page, 'Root node', 'Beta');
}

/**
 * Adds a tree through the toolbar and names its root `name`. Adding a tree
 * pans the view to the new root with a transition, and a click on the map
 * stops that transition wherever it is, so the click waits until the root is
 * fully in the viewport. The map does not scroll, so a root left outside it
 * cannot be clicked afterwards.
 */
export async function addTree(page: Page, name: string) {
  await page.locator('#add-tree-button').click();
  await page.keyboard.type(name);
  await expect(page.getByText(name, { exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.locator('.map').click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

import { expect, Page } from '@playwright/test';

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

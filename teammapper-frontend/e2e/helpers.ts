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

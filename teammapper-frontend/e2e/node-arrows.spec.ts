import { test, expect } from '@playwright/test';
import {
  arrows,
  clickArrow,
  connectWithArrow,
  createMapWithTwoChildren,
  endUndoStep,
} from './helpers';

test.describe('node arrows', () => {
  // The arrows flag ships off and gates the connect button.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/settings', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.systemSettings.featureFlags.arrows = true;
      await route.fulfill({ response, json });
    });
  });

  test('creates an arrow between two nodes and draws it again after a reload', async ({
    page,
  }) => {
    await createMapWithTwoChildren(page);

    await connectWithArrow(page, 'Alpha', 'Beta');
    await expect(arrows(page)).toHaveCount(1);

    await page.reload();
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(arrows(page)).toHaveCount(1);
  });

  test('removes a selected arrow with Delete, brings it back with undo and removes it again with redo', async ({
    page,
  }) => {
    await createMapWithTwoChildren(page);
    await connectWithArrow(page, 'Alpha', 'Beta');
    await expect(arrows(page)).toHaveCount(1);

    await clickArrow(page);
    await expect(arrows(page).first()).toHaveClass(/selected/);
    await endUndoStep(page);
    await page.keyboard.press('Delete');

    await expect(arrows(page)).toHaveCount(0);
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(page.getByText('Beta', { exact: true })).toBeVisible();

    await page.locator('#undo-button').click();
    await expect(arrows(page)).toHaveCount(1);

    await page.locator('#redo-button').click();
    await expect(arrows(page)).toHaveCount(0);
  });

  test('removes a node with its arrow and restores both with one undo', async ({
    page,
  }) => {
    await createMapWithTwoChildren(page);
    await connectWithArrow(page, 'Alpha', 'Beta');
    await expect(arrows(page)).toHaveCount(1);

    await page.getByText('Beta', { exact: true }).click();
    await endUndoStep(page);
    await page.locator('#floating-remove-node').click();
    await expect(page.getByText('Beta', { exact: true })).toHaveCount(0);
    await expect(arrows(page)).toHaveCount(0);

    await page.locator('#undo-button').click();
    await expect(page.getByText('Beta', { exact: true })).toBeVisible();
    await expect(arrows(page)).toHaveCount(1);
  });

  test('imports a JSON file with arrows and restores the old arrows with one undo', async ({
    page,
  }) => {
    await createMapWithTwoChildren(page);
    await connectWithArrow(page, 'Alpha', 'Beta');
    await expect(arrows(page)).toHaveCount(1);
    const oldKey = await arrows(page).first().getAttribute('data-key');

    await page.locator('#menu-import').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('JSON').click();
    await (await chooser).setFiles('./e2e/fake-data/arrows-map.json');

    await expect(page.getByText('Imported A', { exact: true })).toBeVisible();
    await expect(arrows(page)).toHaveCount(1);
    await expect(arrows(page).first()).toHaveAttribute(
      'data-key',
      'b2222222-2222-4222-8222-222222222222:c3333333-3333-4333-8333-333333333333'
    );

    await page.locator('#undo-button').click();
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(arrows(page)).toHaveCount(1);
    await expect(arrows(page).first()).toHaveAttribute(
      'data-key',
      oldKey ?? ''
    );
  });

  test('draws an arrow one client creates on the other client', async ({
    page,
    browser,
  }) => {
    await createMapWithTwoChildren(page);

    const secondContext = await browser.newContext();
    try {
      const second = await secondContext.newPage();
      await second.goto(page.url());
      await expect(second.getByText('Beta', { exact: true })).toBeVisible();
      await expect(arrows(second)).toHaveCount(0);

      await connectWithArrow(page, 'Alpha', 'Beta');

      await expect(arrows(second)).toHaveCount(1);
    } finally {
      await secondContext.close();
    }
  });
});

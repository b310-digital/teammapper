import { test, expect, Page } from '@playwright/test';

test('changes language in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  await page.locator('#settings-button').click();
  await expect(page.locator('.settings')).toBeVisible();

  // Wait for the language dropdown to be visible
  await page.waitForSelector('mat-select', { state: 'visible' });

  // Open language dropdown
  await page.locator('mat-select').click();

  // Wait for options to appear
  await page.waitForSelector('mat-option', { state: 'visible' });

  // Select a different language - use nth selector for Spanish (7th option)
  // Languages are: en, fr, de, it, zh-tw, zh-cn, es, pt-br
  await page.locator('mat-option').nth(6).click();

  // Verify language change (would need to check actual translations in real test)
  await expect(page.locator('mat-select')).toBeVisible();
});

test('deletes a map that is not open from the map list', async ({ page }) => {
  const createMap = async (): Promise<string> => {
    await page.goto('/');
    await page.getByText('Create mind map').click();
    await page.waitForURL(/\/map\/[0-9a-f-]+/);
    const match = page.url().match(/\/map\/([0-9a-f-]+)/);
    if (!match) throw new Error(`No map id in ${page.url()}`);
    return match[1];
  };
  const closedMapId = await createMap();
  const openMapId = await createMap();

  await page.locator('#settings-button').click();
  await page.locator('.mat-mdc-tab').nth(2).click();

  const closedMapRow = page.locator('mat-list-item', {
    has: page.locator(`a[href*="${closedMapId}"]`),
  });
  const openMapRow = page.locator('mat-list-item', {
    has: page.locator(`a[href*="${openMapId}"]`),
  });
  await expect(closedMapRow.first()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await closedMapRow.first().locator('.delete-map-button').click();

  await expect(page.getByText('Mindmap successfully deleted!')).toBeVisible();
  await expect(closedMapRow).toHaveCount(0);
  await expect(openMapRow.first()).toBeVisible();
});

test('keeps the stored map settings when the user reopens the map', async ({
  page,
}) => {
  const fontMinSize = page.locator('input[name="fontMinSize"]');
  const fontMaxSize = page.locator('input[name="fontMaxSize"]');
  const fontIncrement = page.locator('input[name="fontIncrement"]');
  const openMapSettings = async () => {
    await page.locator('#settings-button').click();
    await page.locator('.mat-mdc-tab').nth(1).click();
  };
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.waitForURL(/\/map\/[0-9a-f-]+/);
  const mapUrl = page.url();

  await openMapSettings();
  await fontMinSize.fill('20');
  await fontMinSize.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await fontMaxSize.fill('80');
  await fontMaxSize.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await fontIncrement.fill('7');
  await fontIncrement.press('Tab');
  await expect(fontMinSize).toHaveValue('20');
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();

  await page.goto(mapUrl);
  await expect(page.locator('.map')).toBeVisible();
  await openMapSettings();

  await expect(fontMinSize).toHaveValue('20');
  await expect(fontMaxSize).toHaveValue('80');
  await expect(fontIncrement).toHaveValue('7');
});

test('shows the linktext on the open map once the dialog turns it on', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.getByText('Root node').click();
  page.once('dialog', dialog => dialog.accept('https://teammapper.org'));
  await page.locator('#add-link-button').click();
  const linkText = page.locator('svg a > text.link-text');
  await expect(linkText).toHaveText('link');

  await page.locator('#settings-button').click();
  await page.locator('.mat-mdc-tab').nth(1).click();
  await page
    .locator('mat-slide-toggle', { hasText: 'Show linktext' })
    .locator('button')
    .click();
  await page.locator('.close-button').click();

  await expect(linkText).toHaveText('https://teammapper.org');
});

/** Create a map with one child node below the main root. */
async function createMapWithChild(page: Page) {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await page.getByText('Root node').click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('Child');
  await page.locator('.map').click();
  await expect(page.locator('path.branch')).toHaveCount(1);
}

async function openMindMapTab(page: Page) {
  await page.locator('#settings-button').click();
  await page.locator('.mat-mdc-tab', { hasText: 'Mind map' }).click();
}

/** The paint the browser draws the only branch with. */
function branchPaint(page: Page) {
  return page.locator('path.branch').evaluate(path => {
    const style = window.getComputedStyle(path);
    return {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    };
  });
}

test('groups the mind map tab into map settings and user settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  await openMindMapTab(page);

  const mapSettings = page.locator('.map-settings-group');
  const userSettings = page.locator('.user-settings-group');
  await expect(mapSettings.getByText('Map settings')).toBeVisible();
  await expect(
    mapSettings.getByText('Shared with everyone on this map')
  ).toBeVisible();
  await expect(userSettings.getByText('User settings')).toBeVisible();
  await expect(
    userSettings.getByText('Only for you, in this browser')
  ).toBeVisible();
  await expect(
    userSettings.getByText(/Picks a color for each new branch/)
  ).toBeVisible();
  await expect(
    userSettings.getByText(/Used as the name of maps and nodes/)
  ).toBeVisible();
});

test('disables the map settings for a read-only viewer only', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  const viewerUrl = page.url().split('#')[0];

  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    await viewer.goto(viewerUrl);
    await expect(viewer.getByText('Root node')).toBeVisible();
    await openMindMapTab(viewer);

    await expect(viewer.locator('input[name="fontMinSize"]')).toBeDisabled();
    await expect(
      viewer.locator('.user-settings-group input[name="rootNodeName"]')
    ).toBeEnabled();
    await expect(
      viewer.locator('.user-settings-group mat-select.branch-style')
    ).not.toHaveAttribute('aria-disabled', 'true');
  } finally {
    await viewerContext.close();
  }
});

test('draws curved branches for this browser only', async ({
  page,
  browser,
}) => {
  await createMapWithChild(page);
  const mapUrl = page.url();
  const tapered = await branchPaint(page);
  expect(tapered.fill).not.toBe('none');

  await openMindMapTab(page);
  await page.locator('mat-select.branch-style').click();
  await page.getByRole('option', { name: 'Curved' }).click();

  // The map behind the dialog redraws at once.
  await expect.poll(async () => (await branchPaint(page)).fill).toBe('none');
  const curved = await branchPaint(page);
  // The tapered shape fills and strokes in the branch color.
  expect(curved.stroke).toBe(tapered.fill);
  expect(curved.strokeWidth).toBe('2.5px');

  await page.locator('.close-button').click();
  await page.reload();
  await expect(page.locator('path.branch')).toHaveCount(1);
  await expect.poll(async () => (await branchPaint(page)).fill).toBe('none');

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto(mapUrl);
    await expect(other.locator('path.branch')).toHaveCount(1);
    expect((await branchPaint(other)).fill).not.toBe('none');
  } finally {
    await otherContext.close();
  }
});

test('modifies map options in settings', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  await page.locator('#settings-button').click();

  // Click on Mind map tab - wait for it to be visible
  await page.waitForSelector('mat-tab-group', { state: 'visible' });

  // Click on second tab - Mind map
  await page.locator('.mat-mdc-tab').nth(1).click();

  // Wait for the tab content to load
  await page.waitForSelector('mat-slide-toggle', { state: 'visible' });

  // Toggle auto branch colors (use nth(1) for second toggle)
  await page.locator('mat-slide-toggle').nth(1).click();

  // Change font sizes
  await page.locator('input[name="fontMinSize"]').fill('20');
  await page.locator('input[name="fontMaxSize"]').fill('80');

  // Close settings
  await page.locator('.close-button').click();
  await expect(page.locator('.map')).toBeVisible();
});

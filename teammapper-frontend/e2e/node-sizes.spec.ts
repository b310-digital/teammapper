import { expect, Page, test } from '@playwright/test';
import { createMap } from './helpers';

/**
 * A node is as wide as its name, measured in the font the app ships, so its
 * width is the same in every browser and after every reload.
 */

/** The node padding mmp adds around a name, `NODE_WIDTH_PADDING`. */
const WIDTH_PADDING = 45;

function node(page: Page, name: string) {
  return page
    .locator('g.node')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** The drawn width of the node's background and of its name. */
async function widths(page: Page, name: string) {
  return node(page, name).evaluate(group => {
    const background = group.querySelector('path.background');
    const text = group.querySelector('foreignObject.name > div');
    if (!(background instanceof SVGPathElement)) throw new Error('No path');
    if (!(text instanceof HTMLElement)) throw new Error('No name');
    return {
      background: Math.round(background.getBBox().width),
      name: text.offsetWidth,
    };
  });
}

async function fontsLoaded(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test('sizes a node from its name in the shipped font', async ({ page }) => {
  await createMap(page);
  await fontsLoaded(page);

  const fontFamily = await page
    .getByText('Root node', { exact: true })
    .evaluate(name => getComputedStyle(name).fontFamily);
  expect(fontFamily).toContain('Fira Sans');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check("16px 'Fira Sans'")))
    .toBe(true);

  await expect
    .poll(async () => {
      const { background, name } = await widths(page, 'Root node');
      return background - name;
    })
    .toBe(WIDTH_PADDING);
});

test('keeps node widths after a reload', async ({ page }) => {
  await createMap(page);
  await fontsLoaded(page);
  await expect
    .poll(async () => {
      const { background, name } = await widths(page, 'Root node');
      return background - name;
    })
    .toBe(WIDTH_PADDING);
  const before = await widths(page, 'Root node');

  await page.reload();
  await expect(page.locator('#add-tree-button')).toBeEnabled();
  await fontsLoaded(page);

  await expect.poll(() => widths(page, 'Root node')).toEqual(before);
});

test('grows a node while its name is edited', async ({ page }) => {
  await createMap(page);
  await page.getByText('Root node', { exact: true }).click();
  await page.locator('#floating-add-node').click();
  await page.keyboard.type('A');
  const short = await widths(page, 'A');

  await page.keyboard.type(' much longer name');

  // Still editing: the node grows before the name is committed.
  await expect
    .poll(async () => (await widths(page, 'A much longer name')).background)
    .toBeGreaterThan(short.background);
  await expect
    .poll(async () => {
      const { background, name } = await widths(page, 'A much longer name');
      return background - name;
    })
    .toBe(WIDTH_PADDING);
});

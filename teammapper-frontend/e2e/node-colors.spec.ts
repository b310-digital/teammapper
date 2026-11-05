import { test, expect, Page } from '@playwright/test';
import { createMap } from './helpers';

/** A fill or color the browser computed from a hex color with transparency. */
const TRANSPARENT_ROOT_GREY = /^rgba\(245, 245, 245, 0\.\d+\)$/;

function rootBackground(page: Page) {
  return page
    .locator('g.node')
    .filter({ hasText: 'Root node' })
    .locator('path.background');
}

/** Moves the alpha slider of the open color picker to a third. */
async function lowerTransparency(page: Page) {
  const slider = page.locator('color-picker .alpha').first();
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  if (!box) throw new Error('The color picker shows no alpha slider.');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
}

test('keeps a transparent background from the color picker after a reload', async ({
  page,
}) => {
  await createMap(page);
  await page.getByText('Root node').click();

  await page.locator('input.background-color').click();
  await lowerTransparency(page);
  await page.locator('.colors-panel .background').dispatchEvent('mousedown');

  await expect(rootBackground(page)).toHaveCSS('fill', TRANSPARENT_ROOT_GREY);

  await page.reload();
  await expect(rootBackground(page)).toHaveCSS('fill', TRANSPARENT_ROOT_GREY);
  await page.getByText('Root node').click();
  await expect(page.locator('input.background-color')).toHaveCSS(
    'background-color',
    TRANSPARENT_ROOT_GREY
  );
});

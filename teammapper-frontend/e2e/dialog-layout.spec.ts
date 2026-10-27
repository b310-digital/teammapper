import { test, expect, Locator, Page, TestInfo } from '@playwright/test';
import { createMap } from './helpers';

// A stuck action fails with its own call log instead of the test timeout.
test.use({ actionTimeout: 10_000 });

const themes = ['light', 'dark'] as const;
type Theme = (typeof themes)[number];

function dialogSurface(page: Page): Locator {
  return page.locator('mat-dialog-container .mat-mdc-dialog-surface');
}

/** Waits for the open animation, which scales and fades the dialog in. */
async function waitForDialogOpen(page: Page) {
  const container = page.locator('mat-dialog-container');
  await expect(container).toHaveClass(/mdc-dialog--open/);
  await expect(container).not.toHaveClass(/mdc-dialog--opening/);
}

/** Opens a settings tab and waits until its content stops sliding in. */
async function openSettingsTab(page: Page, label: string) {
  await page.getByRole('tab', { name: label }).click();
  const content = page.locator(
    'mat-tab-body.mat-mdc-tab-body-active .mat-mdc-tab-body-content'
  );
  await expect
    .poll(() =>
      content.evaluate(element => getComputedStyle(element).transform)
    )
    .toBe('none');
}

/** Turns dark mode on from the General tab of the settings dialog. */
async function enableDarkMode(page: Page) {
  await page.locator('#settings-button').click();
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await page.locator('.close-button').click();
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
}

async function openMapInTheme(page: Page, theme: Theme) {
  await createMap(page);
  if (theme === 'dark') await enableDarkMode(page);
}

/** The width inside the padding of the name dialog's content. */
async function contentInnerWidth(page: Page): Promise<number> {
  return page
    .locator('teammapper-dialog-display-name mat-dialog-content')
    .evaluate(element => {
      const style = getComputedStyle(element);
      const padding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return element.clientWidth - padding;
    });
}

async function surfaceBackground(page: Page): Promise<string> {
  return dialogSurface(page).evaluate(
    element => getComputedStyle(element).backgroundColor
  );
}

async function surfaceHeight(page: Page): Promise<number> {
  const box = await dialogSurface(page).boundingBox();
  if (!box) throw new Error('the dialog surface is not visible');
  return box.height;
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

for (const theme of themes) {
  test(`the name field spans the name dialog in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    await openMapInTheme(page, theme);
    await page.locator('teammapper-client-colors-panel button.client').click();
    await waitForDialogOpen(page);

    const field = page.locator('teammapper-dialog-display-name mat-form-field');
    const fieldBox = await field.boundingBox();
    expect(fieldBox?.width).toBeCloseTo(await contentInnerWidth(page), 0);
    const background = expect(await surfaceBackground(page));
    if (theme === 'dark') background.not.toBe('rgb(255, 255, 255)');
    else background.toBe('rgb(255, 255, 255)');
    await screenshot(page, testInfo, `display-name-${theme}`);
  });

  test(`the settings dialog keeps its height across tabs in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    await openMapInTheme(page, theme);
    await page.locator('#settings-button').click();
    await waitForDialogOpen(page);

    const heights: number[] = [];
    for (const tab of ['General', 'Mind map', 'List of created maps']) {
      await openSettingsTab(page, tab);
      heights.push(await surfaceHeight(page));
      await screenshot(page, testInfo, `settings-${theme}-${tab}`);
    }
    expect(new Set(heights).size).toBe(1);
  });
}

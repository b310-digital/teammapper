import { test, expect } from '@playwright/test';

// Regression for issue #1249: on mobile, double-tapping a node used to blur
// the just-focused contenteditable before the soft keyboard could open. The
// root cause was that d3-drag's `started` callback re-calls selectNode for
// the same node on the second tap, and selectNode was unconditionally
// blurring the previously-selected node's name DOM.
test('double-tap on root keeps focus on contenteditable for editing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Create mind map').click();

  const root = page.getByText('Root node');
  await expect(root).toBeVisible();

  await root.tap();
  await root.tap();

  const editable = page.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  await expect(editable).toBeFocused();

  await page.keyboard.type(' tapped');
  await page.locator('.map').tap();

  await expect(page.getByText('Root node tapped')).toBeVisible();
});

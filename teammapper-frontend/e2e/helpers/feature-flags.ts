import type { BrowserContext } from '@playwright/test';
import type { Settings } from '@teammapper/shared';

/** Turns the `multiTree` feature flag on for every page of the context. */
export async function enableMultiTree(context: BrowserContext): Promise<void> {
  await context.route('**/api/settings', async route => {
    const response = await route.fetch();
    const json: Settings = await response.json();
    json.systemSettings.featureFlags.multiTree = true;
    await route.fulfill({ response, json });
  });
}

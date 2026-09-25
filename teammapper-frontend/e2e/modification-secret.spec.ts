import { test, expect, Page } from '@playwright/test';
import path from 'path';

const IMAGE_PATH = path.join(__dirname, 'fake-data', 'radial-tree.png');

/** Records the URL of every HTTP request and WebSocket the page opens. */
function recordUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', request => urls.push(request.url()));
  page.on('websocket', socket => urls.push(socket.url()));
  return urls;
}

test('keeps the modification secret out of URLs and syncs edits from a second client', async ({
  page,
  browser,
}) => {
  const ownerUrls = recordUrls(page);
  await page.goto('/');
  await page.getByText('Create mind map').click();
  await expect(page.getByText('Root node')).toBeVisible();
  const secret = new URL(page.url()).hash.slice(1);
  expect(secret).not.toBe('');

  // The second client opens the map from its URL, so it loads the map and
  // connects the Yjs WebSocket with the secret from the fragment.
  const editorContext = await browser.newContext();
  try {
    const editor = await editorContext.newPage();
    const editorUrls = recordUrls(editor);
    await editor.goto(page.url());
    await expect(editor.getByText('Root node')).toBeVisible();

    // A write through the WebSocket reaches the owner only from a writable connection.
    await editor.locator("button[title='Adds a node']").click();
    await editor.keyboard.type('Editor node');
    await editor.locator('.map').click();
    await expect(page.getByText('Editor node')).toBeVisible();

    await editor.getByText('Editor node').click();
    const upload = editor.waitForRequest(/\/images$/);
    await editor.locator('#image-upload').setInputFiles(IMAGE_PATH);
    const headers = await (await upload).allHeaders();
    expect(headers['x-map-modification-secret']).toBe(secret);
    expect(headers['authorization']).toBeUndefined();
    await expect(page.locator('svg image').first()).toBeVisible({
      timeout: 5000,
    });

    for (const url of [...ownerUrls, ...editorUrls]) {
      expect(url).not.toContain(secret);
    }
  } finally {
    await editorContext.close();
  }
});

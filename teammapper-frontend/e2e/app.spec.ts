import { test } from '@playwright/test';

/*
* Playwright e2e tests
*/

test.beforeEach(async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
});

test('creates a document and changes the location', async ({ browser }) => {
  const context = await browser.newContext({
    //cache: 'disabled',
    //ignoreHTTPSErrors: true,
    // extraHTTPHeaders: {
    //   'upgrade-insecure-requests': '0',
    // },
    //args: ['--disable-web-security'],
  });

  const page = await context.newPage();
  await page.route('**/*', async route => {
    console.log('Route intercepted:', route.request().url());
    console.log(await route.request().allHeaders());
    route.continue();
  });



  page.on('requestfailed', async request => {
    console.log(await request.allHeaders());
    console.log('Request failed:', request.url(), request.failure()?.errorText);
  });

  await page.goto('/');

  await page.waitForSelector('[ng-version]', { timeout: 10000 });
});

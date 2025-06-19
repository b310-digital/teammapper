import { defineConfig, devices } from '@playwright/test';

const connectOptions = process.env.TESTING_PLAYWRIGHT_WS_ENDPOINT
  ? {
      connectOptions: {
        wsEndpoint: process.env.TESTING_PLAYWRIGHT_WS_ENDPOINT ?? '',
      },
    }
  : {};

export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    ...{
      /* Base URL to use in actions like `await page.goto('/')`. */

      ignoreHTTPSErrors: true,
      baseURL:
        process.env.TESTING_PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',

      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
    },
    ...connectOptions,
  },

  /* Configure projects for major browsers
   * Chrome does not work as it always tried to forward to https
   */
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  outputDir: './playwright/output',

  /* Run your local dev server before starting the tests */
  webServer: {
    port: 4200,
    command: 'npm run --prefix ../teammapper-backend dev',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

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
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Maximum time one test can run */
  timeout: 30 * 1000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    ...{
      ignoreHTTPSErrors: true,
      baseURL:
        process.env.TESTING_PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',

      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',

      /* Test isolation - each test gets a fresh context */
      testIdAttribute: 'data-testid',
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
  webServer: [
    {
      port: 3000,
      command: 'npm run --prefix ../teammapper-backend start',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120 * 1000, // 2 minutes timeout
    },
    {
      port: 4200,
      command: 'npm run start',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120 * 1000, // 2 minutes timeout
    },
  ],
});

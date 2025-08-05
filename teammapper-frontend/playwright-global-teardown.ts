import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('Global teardown: Cleaning up...');
  
  // The webServer process should be automatically killed by Playwright
  // but we can add additional cleanup here if needed
  
  // Force exit to ensure the process terminates
  if (!process.env.CI) {
    // Give some time for graceful shutdown
    setTimeout(() => {
      console.log('Forcing process exit...');
      process.exit(0);
    }, 1000);
  }
}

export default globalTeardown;
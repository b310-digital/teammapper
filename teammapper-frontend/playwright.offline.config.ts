import { defineConfig } from '@playwright/test';
import webConfig from './playwright.config';

/**
 * Runs the specs that need no server against the offline build. The offline
 * build stores maps in the browser, so this config starts no backend. Tests
 * tagged @server check what only the backend provides and are left out.
 */
export default defineConfig({
  ...webConfig,
  // The root keeps the snapshot paths of the web specs under e2e/.
  testDir: '.',
  testMatch: [
    'e2e/app.spec.ts',
    'e2e/node-editing.spec.ts',
    'e2e/node-images.spec.ts',
    'e2e/import-export.spec.ts',
    'e2e/undo-redo.spec.ts',
    'e2e/settings.spec.ts',
    'e2e/navigation.spec.ts',
    'e2e-offline/**/*.spec.ts',
  ],
  grepInvert: [
    /@server/,
    // The spec reloads right after the edit, and Chromium drops the IndexedDB
    // write still running at that moment. e2e-offline/persistence.spec.ts
    // checks the same once the edit is stored.
    /adds a new node to the map that is saved and retrieved when reloaded/,
  ],
  outputDir: './playwright/output-offline',
  webServer: {
    port: 4200,
    command:
      'node scripts/generate-offline-settings.mjs && pnpm run start --configuration offline',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120 * 1000,
  },
});

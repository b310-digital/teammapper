import { defineConfig } from '@playwright/test';
import webConfig from './playwright.config';

/** The port of the static server of the production offline build. */
export const PRODUCTION_BUILD_PORT = 4300;

// The CI workflow builds the site before it runs the suite. The command
// leaves the workspace packages alone, because the dev server above reads
// them while it runs.
const buildCommand = process.env.CI ? '' : 'pnpm run build:offline-site && ';

/**
 * Runs the specs that need no server against the offline build. The offline
 * build stores maps in the browser, so this config starts no backend. Tests
 * tagged @server check what only the backend provides and are left out.
 */
export default defineConfig({
  ...webConfig,
  // The root still includes the snapshot paths of the web specs under e2e/.
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
  webServer: [
    {
      port: 4200,
      command:
        'pnpm run settings:offline && pnpm run start --configuration offline',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120 * 1000,
    },
    {
      // Only the production build registers the service worker, and the
      // worker accepts only the files the build wrote, so a static server
      // serves the build.
      port: PRODUCTION_BUILD_PORT,
      command: `${buildCommand}pnpm run serve:offline ${PRODUCTION_BUILD_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 180 * 1000,
    },
  ],
});

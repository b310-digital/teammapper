// Writes the default settings of the offline build: DEFAULT_SETTINGS from
// the CommonJS build of @teammapper/shared, with the version of
// teammapper-backend/package.json, and sharing, pictograms and ai turned
// off, since the offline build runs without a server.
//
// IMPRINT_URL and PRIVACY_URL set the targets of the imprint and privacy
// links, as they do in the backend. A blank value counts as unset.
//
// Build the shared package first: pnpm --filter @teammapper/shared run build
// Usage: pnpm run settings:offline [output path]
// The output path defaults to src/assets/settings.offline.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedBuildPath = join(
  frontendRoot,
  '../packages/shared/dist/cjs/index.js'
);
const backendPackagePath = join(
  frontendRoot,
  '../teammapper-backend/package.json'
);
const outputPath =
  process.argv[2] ?? join(frontendRoot, 'src/assets/settings.offline.json');

if (!existsSync(sharedBuildPath)) {
  throw new Error(
    `The @teammapper/shared build is missing at ${sharedBuildPath}. Run \`pnpm --filter @teammapper/shared run build\` first.`
  );
}

const { DEFAULT_SETTINGS } = createRequire(import.meta.url)(sharedBuildPath);
const { version } = JSON.parse(readFileSync(backendPackagePath, 'utf-8'));
const blankToNull = value => value?.trim() || null;

const settings = structuredClone(DEFAULT_SETTINGS);
settings.systemSettings.info.version = version;
Object.assign(settings.systemSettings.featureFlags, {
  sharing: false,
  pictograms: false,
  ai: false,
});
settings.systemSettings.urls.imprintUrl = blankToNull(process.env.IMPRINT_URL);
settings.systemSettings.urls.privacyUrl = blankToNull(process.env.PRIVACY_URL);
writeFileSync(outputPath, `${JSON.stringify(settings, null, 2)}\n`);

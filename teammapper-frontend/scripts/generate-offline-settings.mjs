// Writes the settings of the offline build. The system settings start from
// DEFAULT_SYSTEM_SETTINGS in the CommonJS build of @teammapper/shared, with
// the version of teammapper-backend/package.json. Sharing, pictograms and ai
// are off, since the offline build runs without a server. The user settings
// come from teammapper-backend/config/settings.default.json, the same file
// the server reads.
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
const backendRoot = join(frontendRoot, '../teammapper-backend');
const backendPackagePath = join(backendRoot, 'package.json');
const settingsFilePath = join(backendRoot, 'config/settings.default.json');
const outputPath =
  process.argv[2] ?? join(frontendRoot, 'src/assets/settings.offline.json');

if (!existsSync(sharedBuildPath)) {
  throw new Error(
    `The @teammapper/shared build is missing at ${sharedBuildPath}. Run \`pnpm --filter @teammapper/shared run build\` first.`
  );
}

const { DEFAULT_SYSTEM_SETTINGS, parseSettingsFile } = createRequire(
  import.meta.url
)(sharedBuildPath);
const readJson = path => JSON.parse(readFileSync(path, 'utf-8'));
const blankToNull = value => value?.trim() || null;

const systemSettings = structuredClone(DEFAULT_SYSTEM_SETTINGS);
systemSettings.info.version = readJson(backendPackagePath).version;
Object.assign(systemSettings.featureFlags, {
  sharing: false,
  pictograms: false,
  ai: false,
});
systemSettings.urls.imprintUrl = blankToNull(process.env.IMPRINT_URL);
systemSettings.urls.privacyUrl = blankToNull(process.env.PRIVACY_URL);

const userSettings = parseSettingsFile(
  readJson(settingsFilePath),
  settingsFilePath
);
const settings = { systemSettings, userSettings };
writeFileSync(outputPath, `${JSON.stringify(settings, null, 2)}\n`);

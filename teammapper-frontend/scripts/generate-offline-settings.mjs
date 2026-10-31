// Writes the default settings of the offline build: the backend's production
// settings, deep-merged with offline/settings.override.json the way the
// backend's SettingsService merges its own override file.
//
// IMPRINT_URL and PRIVACY_URL set the targets of the imprint and privacy
// links and win over both files, as they do in the backend. A blank value
// from either source counts as unset.
//
// Usage: pnpm run settings:offline [output path]
// The output path defaults to src/assets/settings.offline.json.
import deepmerge from 'deepmerge';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendSettingsPath = join(
  frontendRoot,
  '../teammapper-backend/config/settings.prod.json'
);
const overridePath = join(frontendRoot, 'offline/settings.override.json');
const outputPath =
  process.argv[2] ?? join(frontendRoot, 'src/assets/settings.offline.json');

const readJson = path => JSON.parse(readFileSync(path, 'utf-8'));

const blankToNull = value => value?.trim() || null;
const readUrl = name => blankToNull(process.env[name]);

const settings = deepmerge(
  readJson(backendSettingsPath),
  readJson(overridePath)
);
const urls = settings.systemSettings.urls;
urls.imprintUrl = readUrl('IMPRINT_URL') ?? blankToNull(urls.imprintUrl);
urls.privacyUrl = readUrl('PRIVACY_URL') ?? blankToNull(urls.privacyUrl);
writeFileSync(outputPath, `${JSON.stringify(settings, null, 2)}\n`);

// Writes the default settings of the offline build: the backend's production
// settings, deep-merged with offline/settings.override.json the way the
// backend's SettingsService merges its own override file.
//
// Usage: node scripts/generate-offline-settings.mjs [output path]
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

const settings = deepmerge(
  readJson(backendSettingsPath),
  readJson(overridePath)
);
writeFileSync(outputPath, `${JSON.stringify(settings, null, 2)}\n`);

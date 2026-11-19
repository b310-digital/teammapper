import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { createRequire } from 'module';
import { join } from 'path';
import type { Settings } from '@teammapper/shared';

const script = join(__dirname, 'generate-offline-settings.mjs');
const sharedCjsBuild = join(
  __dirname,
  '../../packages/shared/dist/cjs/index.js'
);
const backendPackage = join(__dirname, '../../teammapper-backend/package.json');
const defaultSettingsFile = join(
  __dirname,
  '../../teammapper-backend/config/settings.default.json'
);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf-8'));

const loadDefaultSettings = (): Settings => {
  const shared = createRequire(__filename)(sharedCjsBuild) as {
    DEFAULT_SYSTEM_SETTINGS: Settings['systemSettings'];
  };
  const file = readJson(defaultSettingsFile) as Pick<Settings, 'userSettings'>;
  return {
    systemSettings: JSON.parse(JSON.stringify(shared.DEFAULT_SYSTEM_SETTINGS)),
    userSettings: file.userSettings,
  };
};

const backendVersion = (): string =>
  (readJson(backendPackage) as { version: string }).version;

type OfflineSettings = Settings;

/** Runs the script with the given url variables and nothing else set. */
const generate = (output: string, env: Record<string, string> = {}): void => {
  const base = { ...process.env };
  delete base['IMPRINT_URL'];
  delete base['PRIVACY_URL'];
  execFileSync(process.execPath, [script, output], {
    env: { ...base, ...env },
  });
};

describe('generate-offline-settings', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'offline-settings-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('writes the default settings with the backend version and the server features off', () => {
    const output = join(outputDir, 'settings.offline.json');
    const expected = loadDefaultSettings();
    expected.systemSettings.info.version = backendVersion();
    Object.assign(expected.systemSettings.featureFlags, {
      sharing: false,
      pictograms: false,
      ai: false,
    });

    generate(output);

    expect(readJson(output)).toEqual(expected);
  });

  it('leaves both legal urls null without IMPRINT_URL and PRIVACY_URL', () => {
    const output = join(outputDir, 'settings.offline.json');

    generate(output, { IMPRINT_URL: ' ', PRIVACY_URL: '' });

    expect((readJson(output) as OfflineSettings).systemSettings.urls).toEqual(
      expect.objectContaining({ imprintUrl: null, privacyUrl: null })
    );
  });

  it('writes IMPRINT_URL and PRIVACY_URL into the legal urls', () => {
    const output = join(outputDir, 'settings.offline.json');

    generate(output, {
      IMPRINT_URL: 'https://teammapper.localhost/imprint',
      PRIVACY_URL: 'https://teammapper.localhost/privacy',
    });

    expect((readJson(output) as OfflineSettings).systemSettings.urls).toEqual(
      expect.objectContaining({
        imprintUrl: 'https://teammapper.localhost/imprint',
        privacyUrl: 'https://teammapper.localhost/privacy',
      })
    );
  });
});

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const script = join(__dirname, 'generate-offline-settings.mjs');
const backendSettings = join(
  __dirname,
  '../../teammapper-backend/config/settings.prod.json'
);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf-8'));

interface OfflineSettings {
  systemSettings: {
    info: Record<string, unknown>;
    urls: Record<string, string | null>;
    featureFlags: Record<string, boolean>;
  };
}

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

  it('writes the production settings with the server features off', () => {
    const output = join(outputDir, 'settings.offline.json');
    const expected = readJson(backendSettings) as OfflineSettings;
    expected.systemSettings.info['aiModel'] = null;
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

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
    const expected = readJson(backendSettings) as {
      systemSettings: {
        info: Record<string, unknown>;
        featureFlags: Record<string, boolean>;
      };
    };
    expected.systemSettings.info['aiModel'] = null;
    Object.assign(expected.systemSettings.featureFlags, {
      sharing: false,
      pictograms: false,
      ai: false,
    });

    execFileSync(process.execPath, [script, output]);

    expect(readJson(output)).toEqual(expected);
  });
});

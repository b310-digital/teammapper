import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const LANGUAGE_FILES = readdirSync(__dirname)
  .filter(file => file.endsWith('.json'))
  .sort();

/** The keys of nested translations as dotted paths, such as `TOASTS.MAP_RESET`. */
function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

function keysOf(file: string): string[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(__dirname, file), 'utf8')
  );
  return flatKeys(parsed).sort();
}

describe('translation files', () => {
  it('ships the nine supported languages', () => {
    expect(LANGUAGE_FILES).toEqual([
      'de.json',
      'en.json',
      'es.json',
      'fr.json',
      'it.json',
      'ja.json',
      'pt-br.json',
      'zh-cn.json',
      'zh-tw.json',
    ]);
  });

  describe.each([
    'TOASTS.MAP_TOO_LARGE',
    'TOASTS.MAP_UPDATE_REJECTED',
    'TOASTS.MAP_RESET',
  ])('the key %s', key => {
    it.each(LANGUAGE_FILES)('exists in %s', file => {
      expect(keysOf(file)).toContain(key);
    });
  });
});

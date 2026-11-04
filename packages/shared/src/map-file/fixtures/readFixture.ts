import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The text of a map file fixture in this folder, such as `v2.json`. */
export function readFixture(name: string): string {
  return readFileSync(join(__dirname, name), 'utf8');
}

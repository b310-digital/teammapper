import { InjectionToken } from '@angular/core';
import * as Y from 'yjs';
import { META } from '../../map-sync/yjs-map-data';
import { DATA_MIGRATIONS } from './migrations/data-migrations';

/**
 * Brings the doc of a map from format number `formatNumber - 1` to
 * `formatNumber`. A data migration changes the doc in place and throws when
 * it cannot, which leaves the stored map unchanged. A later build adds one
 * with every change to how it stores a map, and never edits a released one.
 */
export interface DataMigration {
  formatNumber: number;
  migrate(doc: Y.Doc): void;
}

/** The format number this build reads and writes, and the migrations to it. */
export interface MapFormat {
  formatNumber: number;
  migrations: readonly DataMigration[];
}

/** A map whose doc a later build saved, with a higher format number. */
export class NewerMapFormatError extends Error {}

/**
 * The format of this build. The data migrations take the format numbers 2,
 * 3, 4 and so on without a gap, so the build's format number is one more
 * than their count.
 */
export const MAP_FORMAT = new InjectionToken<MapFormat>('MAP_FORMAT', {
  providedIn: 'root',
  factory: () => ({
    formatNumber: 1 + DATA_MIGRATIONS.length,
    migrations: DATA_MIGRATIONS,
  }),
});

// The key of the format number in the doc's `meta` map.
const DOC_FORMAT_NUMBER_KEY = 'formatNumber';

/** The format number the doc was saved with, 1 when it carries none. */
export function mapFormatNumber(doc: Y.Doc): number {
  const formatNumber = doc.getMap(META).get(DOC_FORMAT_NUMBER_KEY);
  return typeof formatNumber === 'number' ? formatNumber : 1;
}

export function stampFormatNumber(doc: Y.Doc, formatNumber: number): void {
  doc.getMap(META).set(DOC_FORMAT_NUMBER_KEY, formatNumber);
}

/**
 * The data migrations that bring a map from format number `from` to the one
 * of `format`, in order. Throws when one of them is missing.
 */
export function pendingMigrations(
  format: MapFormat,
  from: number
): DataMigration[] {
  const pending: DataMigration[] = [];
  for (let next = from + 1; next <= format.formatNumber; next++) {
    const migration = format.migrations.find(
      ({ formatNumber }) => formatNumber === next
    );
    if (!migration) throw new Error(`The data migration to ${next} is missing`);
    pending.push(migration);
  }
  return pending;
}

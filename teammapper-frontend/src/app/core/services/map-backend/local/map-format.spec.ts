import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import {
  DataMigration,
  MAP_FORMAT,
  mapFormatNumber,
  pendingMigrations,
  stampFormatNumber,
} from './map-format';

const migration = (formatNumber: number): DataMigration => ({
  formatNumber,
  migrate: jest.fn(),
});

describe('map format', () => {
  it('reads and writes format number 1 with no data migration by default', () => {
    expect(TestBed.inject(MAP_FORMAT)).toEqual({
      formatNumber: 1,
      migrations: [],
    });
  });

  describe('mapFormatNumber', () => {
    it('is 1 for a doc that carries none', () => {
      expect(mapFormatNumber(new Y.Doc())).toBe(1);
    });

    it('is the number stamped into the doc', () => {
      const doc = new Y.Doc();

      stampFormatNumber(doc, 3);

      expect(mapFormatNumber(doc)).toBe(3);
    });

    it('keeps the number in the meta map of the doc', () => {
      const doc = new Y.Doc();

      stampFormatNumber(doc, 2);

      expect(doc.getMap('meta').get('formatNumber')).toBe(2);
    });
  });

  describe('pendingMigrations', () => {
    it('returns the migrations above the format number in order', () => {
      const migrations = [migration(2), migration(3), migration(4)];

      const pending = pendingMigrations(
        {
          formatNumber: 4,
          migrations: [migrations[2], migrations[0], migrations[1]],
        },
        2
      );

      expect(pending).toEqual([migrations[1], migrations[2]]);
    });

    it('returns no migration for a map on the current format number', () => {
      expect(
        pendingMigrations({ formatNumber: 2, migrations: [migration(2)] }, 2)
      ).toEqual([]);
    });

    it('throws when a migration between the two format numbers is missing', () => {
      expect(() =>
        pendingMigrations({ formatNumber: 3, migrations: [migration(3)] }, 1)
      ).toThrow();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { MAP_CONNECTION_FACTORY } from '../map-connection';
import { MAP_STORE } from '../map-store';
import { OFFLINE_MODE, SETTINGS_URL } from '../map-backend-config';
import { provideLocalMapBackend } from './local-map-backend.providers';

describe('provideLocalMapBackend', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideLocalMapBackend()] });
  });

  it('reads the default settings from the bundled file', () => {
    expect(TestBed.inject(SETTINGS_URL)).toBe('assets/settings.offline.json');
  });

  it('reports that the app runs offline', () => {
    expect(TestBed.inject(OFFLINE_MODE)).toBe(true);
  });

  it('rejects map store calls until browser storage exists', async () => {
    await expect(TestBed.inject(MAP_STORE).listMaps()).rejects.toThrow(
      'not implemented'
    );
  });

  it('refuses to open a connection until browser storage exists', () => {
    const connect = TestBed.inject(MAP_CONNECTION_FACTORY);

    expect(() => connect('map-1', new Y.Doc(), '')).toThrow('not implemented');
  });
});

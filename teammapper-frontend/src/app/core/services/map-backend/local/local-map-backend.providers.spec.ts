import { TestBed } from '@angular/core/testing';
import { ToastrService } from 'ngx-toastr';
import * as Y from 'yjs';
import { createMockUtilsService } from '../../../../../test/mocks/utils-service.mock';
import { UtilsService } from '../../utils/utils.service';
import { MAP_CONNECTION_FACTORY } from '../map-connection';
import { MAP_STORE } from '../map-store';
import { OFFLINE_MODE, SETTINGS_URL } from '../map-backend-config';
import { LocalMapConnection } from './local-map-connection';
import { provideLocalMapBackend } from './local-map-backend.providers';
import { LocalMapStore } from './local-map-store';

describe('provideLocalMapBackend', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideLocalMapBackend(() => import('y-indexeddb')),
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: UtilsService, useValue: createMockUtilsService() },
      ],
    });
  });

  it('reads the default settings from the bundled file', () => {
    expect(TestBed.inject(SETTINGS_URL)).toBe('assets/settings.offline.json');
  });

  it('reports that the app runs offline', () => {
    expect(TestBed.inject(OFFLINE_MODE)).toBe(true);
  });

  it('keeps maps in browser storage', () => {
    expect(TestBed.inject(MAP_STORE)).toBeInstanceOf(LocalMapStore);
  });

  it('opens connections that keep the doc in browser storage', () => {
    const store = TestBed.inject(LocalMapStore);
    const stopWatching = jest.fn();
    const watch = jest.spyOn(store, 'watchMap').mockReturnValue(stopWatching);
    const doc = new Y.Doc();

    const connection = TestBed.inject(MAP_CONNECTION_FACTORY)('map-1', doc, '');
    connection.destroy();

    expect(connection).toBeInstanceOf(LocalMapConnection);
    expect(watch).toHaveBeenCalledWith('map-1', doc);
    expect(stopWatching).toHaveBeenCalled();
  });
});

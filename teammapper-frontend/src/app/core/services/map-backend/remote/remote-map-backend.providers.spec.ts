import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { MAP_CONNECTION_FACTORY } from '../map-connection';
import { MAP_STORE } from '../map-store';
import { OFFLINE_MODE } from '../offline-mode';
import { SETTINGS_URL } from '../settings-url';
import { provideRemoteMapBackend } from './remote-map-backend.providers';
import { RemoteMapStore } from './remote-map-store';
import { WebsocketMapConnection } from './websocket-map-connection';

jest.mock('y-websocket', () => ({
  WebsocketProvider: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

describe('provideRemoteMapBackend', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRemoteMapBackend()] });
  });

  it('provides the remote map store', () => {
    expect(TestBed.inject(MAP_STORE)).toBeInstanceOf(RemoteMapStore);
  });

  it('opens websocket connections', () => {
    const connect = TestBed.inject(MAP_CONNECTION_FACTORY);

    expect(connect('map-1', new Y.Doc(), '')).toBeInstanceOf(
      WebsocketMapConnection
    );
  });

  it('fetches the default settings from the API', () => {
    expect(TestBed.inject(SETTINGS_URL)).toBe('api/settings');
  });

  it('reports that the app runs online', () => {
    expect(TestBed.inject(OFFLINE_MODE)).toBe(false);
  });
});

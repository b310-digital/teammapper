import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  MAP_CONNECTION_FACTORY,
  MapConnectionFactory,
} from '../map-connection';
import { MAP_STORE, MapStore } from '../map-store';
import { OFFLINE_MODE, SETTINGS_URL } from '../map-backend-config';

const notImplemented = 'Browser storage for maps is not implemented yet';

const rejectAll = (): Promise<never> =>
  Promise.reject(new Error(notImplemented));

/** Placeholder until the map store on browser storage exists. */
const unimplementedMapStore: MapStore = {
  createMap: rejectAll,
  getMap: rejectAll,
  listMaps: rejectAll,
  deleteMap: rejectAll,
  uploadImage: rejectAll,
  imageUrl: () => null,
};

/** Placeholder until the map connection on browser storage exists. */
const unimplementedConnection: MapConnectionFactory = () => {
  throw new Error(notImplemented);
};

/** Keeps maps in the browser and reads the bundled default settings. */
export function provideLocalMapBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MAP_STORE, useValue: unimplementedMapStore },
    { provide: MAP_CONNECTION_FACTORY, useValue: unimplementedConnection },
    { provide: SETTINGS_URL, useValue: 'assets/settings.offline.json' },
    { provide: OFFLINE_MODE, useValue: true },
  ]);
}

import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  MAP_CONNECTION_FACTORY,
  MapConnectionFactory,
} from '../map-connection';
import { MAP_STORE } from '../map-store';
import { OFFLINE_MODE, SETTINGS_URL } from '../map-backend-config';
import { LocalMapConnection } from './local-map-connection';
import { LocalMapStore } from './local-map-store';
import { Y_INDEXEDDB_LOADER, YIndexeddbLoader } from './doc-persistence';

/**
 * Opens connections that keep the doc where the store keeps it. The store
 * watches the open map until its connection closes, to keep the map's record
 * current, and tells the connection when a later build updated the stored
 * maps.
 */
const connectLocally =
  (store: LocalMapStore): MapConnectionFactory =>
  (mapId, doc) =>
    new LocalMapConnection(
      mapId,
      doc,
      () => store.docPersistence(),
      store.watchMap(mapId, doc),
      listener => store.onOutdated(listener)
    );

/**
 * Keeps maps in the browser and reads the bundled default settings.
 *
 * @param loadYIndexeddb loads y-indexeddb on first use
 */
export function provideLocalMapBackend(
  loadYIndexeddb: YIndexeddbLoader
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: Y_INDEXEDDB_LOADER, useValue: loadYIndexeddb },
    LocalMapStore,
    { provide: MAP_STORE, useExisting: LocalMapStore },
    {
      provide: MAP_CONNECTION_FACTORY,
      useFactory: connectLocally,
      deps: [LocalMapStore],
    },
    { provide: SETTINGS_URL, useValue: 'assets/settings.offline.json' },
    { provide: OFFLINE_MODE, useValue: true },
  ]);
}

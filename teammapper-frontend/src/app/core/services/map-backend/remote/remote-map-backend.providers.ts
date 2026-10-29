import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { API_URL } from '../../../http/http.service';
import {
  MAP_CONNECTION_FACTORY,
  MapConnectionFactory,
} from '../map-connection';
import { MAP_STORE } from '../map-store';
import { OFFLINE_MODE } from '../offline-mode';
import { SETTINGS_URL } from '../settings-url';
import { RemoteMapStore } from './remote-map-store';
import { WebsocketMapConnection } from './websocket-map-connection';

const connectOverWebsocket: MapConnectionFactory = (
  mapId,
  doc,
  modificationSecret
) => new WebsocketMapConnection(mapId, doc, modificationSecret);

/** Keeps maps on the TeamMapper backend and syncs them over its websocket. */
export function provideRemoteMapBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MAP_STORE, useClass: RemoteMapStore },
    { provide: MAP_CONNECTION_FACTORY, useValue: connectOverWebsocket },
    { provide: SETTINGS_URL, useValue: `${API_URL.ROOT}/settings` },
    { provide: OFFLINE_MODE, useValue: false },
  ]);
}

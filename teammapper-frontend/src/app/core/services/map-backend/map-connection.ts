import { InjectionToken } from '@angular/core';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { ConnectionStatus } from '../map-sync/map-sync-context';

/**
 * Carries the Y.Doc of the open map and the presence of its clients. A
 * connection may emit an event after `destroy`, so a listener compares the
 * connection with the open one before it acts.
 */
export interface MapConnection {
  readonly awareness: Awareness;
  /** Called each time the doc has synced. */
  onSynced(listener: () => void): void;
  onStatus(listener: (status: NonNullable<ConnectionStatus>) => void): void;
  /** The close code of the connection, null when none is known. */
  onClosed(listener: (code: number | null) => void): void;
  destroy(): void;
}

/** Opens the connection that keeps `doc` in sync with the map `mapId`. */
export type MapConnectionFactory = (
  mapId: string,
  doc: Y.Doc,
  modificationSecret: string
) => MapConnection;

export const MAP_CONNECTION_FACTORY = new InjectionToken<MapConnectionFactory>(
  'MAP_CONNECTION_FACTORY'
);

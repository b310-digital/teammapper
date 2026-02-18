import { CachedMapOptions } from '../../../shared/models/cached-map.model';

export interface SyncStrategy {
  /** One-time connection setup. Socket.io: opens socket. Yjs: no-op. */
  connect(): void;

  /**
   * Initialize syncing for the given map.
   * Caller must call destroy() before initMap() when switching maps.
   * Caller must call setWritable() before initMap() to set permissions.
   */
  initMap(uuid: string): void;

  /** Full cleanup: destroy resources, disconnect, reset all state. Idempotent. */
  destroy(): void;

  /** Undo the last operation. */
  undo(): void;

  /** Redo the last undone operation. */
  redo(): void;

  /** Push map option changes to the server. */
  updateMapOptions(options?: CachedMapOptions): void;

  /** Delete the map by admin ID. */
  deleteMap(adminId: string): Promise<void>;

  /** Set write-access status from HTTP response. */
  setWritable(writable: boolean): void;
}

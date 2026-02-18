import { CachedMapOptions } from '../../../shared/models/cached-map.model';

export interface SyncStrategy {
  /** One-time connection setup. Socket.io: opens socket. Yjs: no-op. */
  connect(): void;

  /** Attach listeners and join the map room for syncing. */
  initMap(uuid: string): void;

  /** Soft reset: detach observers/listeners, leave map. Keep connection alive. */
  detach(): void;

  /** Hard reset: full cleanup, destroy resources, disconnect. */
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

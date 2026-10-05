import { CachedMapEntry, ExportNodeProperties } from '@teammapper/shared';
import type { MapData } from '@teammapper/mmp';
import { ClientColorMapping } from './yjs-utils';

export const DEFAULT_COLOR = '#000000';
export const DEFAULT_SELF_COLOR = '#c0c0c0';

export type ConnectionStatus = 'connected' | 'disconnected' | null;

export interface MapSyncContext {
  getAttachedMap(): CachedMapEntry;
  getModificationSecret(): string;
  getColorMapping(): ClientColorMapping;
  getClientColor(): string;
  colorForNode(nodeId: string): string;
  setConnectionStatus(status: ConnectionStatus): void;
  setColorMapping(mapping: ClientColorMapping): void;
  setAttachedNode(node: ExportNodeProperties | null): void;
  setClientColor(color: string): void;
  setCanUndo(v: boolean): void;
  setCanRedo(v: boolean): void;
  updateAttachedMap(): Promise<void>;
  emitClientList(): void;
  /** The connection synced: create the map over its map data. */
  createMap(data: MapData): void;
  /** The server deleted the map; the page reloads right after. */
  mapDeleted(): void;
}

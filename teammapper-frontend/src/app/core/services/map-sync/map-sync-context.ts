import { ExportNodeProperties } from '@mmp/map/types';
import { CachedMapEntry } from '../../../shared/models/cached-map.model';
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
}

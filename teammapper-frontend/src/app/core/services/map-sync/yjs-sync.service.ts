import { Subscription } from 'rxjs';
import { NodePropertyMapping } from '@mmp/index';
import {
  ExportNodeProperties,
  MapCreateEvent,
  NodeUpdateEvent,
} from '@mmp/map/types';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { API_URL, HttpService } from '../../http/http.service';
import { CachedMapOptions } from '../../../shared/models/cached-map.model';
import {
  ClientColorMapping,
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  resolveClientColor,
  findAffectedNodes,
  resolveMmpPropertyUpdate,
  sortParentFirst,
  collectDescendantIds,
} from './yjs-utils';
import {
  MapSyncContext,
  DEFAULT_COLOR,
  DEFAULT_SELF_COLOR,
} from './map-sync-context';

const WS_CLOSE_MAP_DELETED = 4001;

/**
 * Which operation caused a full-map replacement. Recorded in the doc because
 * Yjs transaction origins are local and never reach the other clients.
 */
type FullMapOperation = 'import' | 'distribute';
const LAST_FULL_MAP_OPERATION = 'lastFullMapOperation';

export class YjsSyncService {
  private yDoc: Y.Doc | null = null;
  private wsProvider: WebsocketProvider | null = null;
  private yjsSynced = false;
  private yjsWritable = false;
  private yjsSubscriptions: Subscription[] = [];
  private yjsMapId: string | null = null;
  private yjsNodesObserver:
    | Parameters<Y.Map<unknown>['observeDeep']>[0]
    | null = null;
  private yjsOptionsObserver: Parameters<Y.Map<unknown>['observe']>[0] | null =
    null;
  private yjsAwarenessHandler: (() => void) | null = null;
  private yUndoManager: Y.UndoManager | null = null;

  constructor(
    private ctx: MapSyncContext,
    private mmpService: MmpService,
    private settingsService: SettingsService,
    private utilsService: UtilsService,
    private toastrService: ToastrService,
    private httpService: HttpService
  ) {}

  // ─── Public API ─────────────────────────────────────────────

  setWritable(writable: boolean): void {
    this.yjsWritable = writable;
  }

  undo(): void {
    this.yUndoManager?.undo();
  }

  redo(): void {
    this.yUndoManager?.redo();
  }

  updateMapOptions(options?: CachedMapOptions): void {
    this.writeMapOptionsToYDoc(options);
  }

  async deleteMap(adminId: string): Promise<void> {
    await this.deleteMapViaHttp(adminId);
  }

  // ─── Connection lifecycle ───────────────────────────────────

  initMap(uuid: string): void {
    if (this.hasActiveConnection(uuid)) {
      this.reattachListeners();
      return;
    }

    this.yjsMapId = uuid;
    this.yDoc = new Y.Doc();
    this.setupConnection(uuid);
    this.setupConnectionStatus();
    this.setupMapDeletionHandler();
    this.createListeners();
  }

  private hasActiveConnection(mapId: string): boolean {
    return (
      this.yDoc !== null && this.wsProvider !== null && this.yjsMapId === mapId
    );
  }

  private reattachListeners(): void {
    this.createListeners();
    if (this.yjsSynced) {
      this.loadMapFromYDoc();
      this.setupNodesObserver();
      this.setupMapOptionsObserver();
      this.setupAwareness();
      this.settingsService.setEditMode(this.yjsWritable);
      this.ctx.setConnectionStatus('connected');
    }
  }

  private setupConnection(mapId: string): void {
    const wsUrl = buildYjsWsUrl();
    this.wsProvider = new WebsocketProvider(wsUrl, mapId, this.yDoc, {
      params: { secret: this.ctx.getModificationSecret() },
      maxBackoffTime: 5000,
      disableBc: true,
    });

    this.wsProvider.on('sync', (synced: boolean) => {
      if (synced && !this.yjsSynced) {
        this.handleFirstSync();
      }
    });
  }

  private handleFirstSync(): void {
    this.yjsSynced = true;
    this.loadMapFromYDoc();
    this.setupNodesObserver();
    this.setupMapOptionsObserver();
    this.initUndoManager();
    this.setupAwareness();
    this.settingsService.setEditMode(this.yjsWritable);
    this.ctx.setConnectionStatus('connected');
  }

  private initUndoManager(): void {
    const nodesMap = this.yDoc.getMap('nodes');
    this.yUndoManager = new Y.UndoManager(nodesMap, {
      // A distribute is tracked so one press is one undo. An import is not:
      // loading a different map over this one is not an editing step.
      trackedOrigins: new Set(['local', 'distribute']),
    });
    this.setupUndoManagerListeners();
  }

  private setupUndoManagerListeners(): void {
    const updateUndoRedoState = () => {
      if (!this.yUndoManager) return;
      this.ctx.setCanUndo(this.yUndoManager.undoStack.length > 0);
      this.ctx.setCanRedo(this.yUndoManager.redoStack.length > 0);
    };

    this.yUndoManager.on('stack-item-added', updateUndoRedoState);
    this.yUndoManager.on('stack-item-popped', updateUndoRedoState);
  }

  private setupConnectionStatus(): void {
    this.wsProvider.on(
      'status',
      (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (!this.wsProvider) return;
        if (event.status === 'connected') {
          this.ctx.setConnectionStatus('connected');
        } else if (event.status === 'disconnected') {
          this.ctx.setConnectionStatus('disconnected');
        }
      }
    );
  }

  private setupMapDeletionHandler(): void {
    this.wsProvider.on('connection-close', (event: CloseEvent | null) => {
      if (event?.code === WS_CLOSE_MAP_DELETED) {
        window.location.reload();
      }
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────

  destroy(): void {
    this.unsubscribeListeners();
    this.detachObservers();
    if (this.yUndoManager) {
      this.yUndoManager.destroy();
      this.yUndoManager = null;
      this.ctx.setCanUndo(false);
      this.ctx.setCanRedo(false);
    }
    const provider = this.wsProvider;
    this.wsProvider = null;
    if (provider) {
      provider.disconnect();
      provider.destroy();
    }
    if (this.yDoc) {
      this.yDoc.destroy();
      this.yDoc = null;
    }
    this.yjsSynced = false;
    this.yjsWritable = false;
    this.yjsMapId = null;
  }

  private detachObservers(): void {
    if (this.yDoc && this.yjsNodesObserver) {
      const nodesMap = this.yDoc.getMap('nodes');
      nodesMap.unobserveDeep(this.yjsNodesObserver);
      this.yjsNodesObserver = null;
    }
    if (this.yDoc && this.yjsOptionsObserver) {
      const optionsMap = this.yDoc.getMap('mapOptions');
      optionsMap.unobserve(this.yjsOptionsObserver);
      this.yjsOptionsObserver = null;
    }
    if (this.wsProvider && this.yjsAwarenessHandler) {
      this.wsProvider.awareness.off('change', this.yjsAwarenessHandler);
      this.yjsAwarenessHandler = null;
    }
  }

  private unsubscribeListeners(): void {
    this.yjsSubscriptions.forEach(sub => sub.unsubscribe());
    this.yjsSubscriptions = [];
  }

  // ─── Initial map load ───────────────────────────────────────

  private loadMapFromYDoc(): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    const snapshot = this.extractSnapshotFromYDoc(nodesMap);
    if (snapshot.length > 0) {
      this.mmpService.new(snapshot, false);
    }
  }

  private extractSnapshotFromYDoc(
    nodesMap: Y.Map<Y.Map<unknown>>
  ): ExportNodeProperties[] {
    const nodes: ExportNodeProperties[] = [];
    nodesMap.forEach((yNode: Y.Map<unknown>) => {
      nodes.push(yMapToNodeProps(yNode));
    });
    return sortParentFirst(nodes);
  }

  // ─── MMP event listeners (MMP → Y.Doc) ─────────────────────

  private createListeners(): void {
    this.unsubscribeListeners();
    this.setupCreateHandler();
    this.setupDistributeHandler();
    this.setupSelectionHandlers();
    this.setupNodeUpdateHandler();
    this.setupNodeCreateHandler();
    this.setupPasteHandler();
    this.setupNodeRemoveHandler();
  }

  private setupCreateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
        this.ctx.setAttachedNode(this.mmpService.selectNode());
        this.ctx.updateAttachedMap();
        if (this.yjsSynced) {
          this.writeFullMapToYDoc('import');
        }
      })
    );
  }

  /**
   * A redistribution rewrites every node's coordinates at once, so it goes out
   * as a full-map replacement rather than as one update per node.
   */
  private setupDistributeHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('distribute').subscribe(() => {
        if (!this.yDoc) return;
        if (this.yjsSynced) {
          this.writeFullMapToYDoc('distribute');
        }
        this.ctx.updateAttachedMap();
      })
    );
  }

  private setupSelectionHandlers(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeSelect')
        .subscribe((nodeProps: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.updateAwarenessSelection(nodeProps.id);
          this.ctx.setAttachedNode(nodeProps);
        })
    );

    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeDeselect')
        .subscribe((nodeProps: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.updateAwarenessSelection(null);
          this.ctx.setAttachedNode(nodeProps);
        })
    );
  }

  private setupNodeUpdateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
        if (!this.yDoc) return;
        this.ctx.setAttachedNode(result.nodeProperties);
        this.writeNodeUpdateToYDoc(result);
        this.ctx.updateAttachedMap();
      })
    );
  }

  private setupNodeCreateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeCreate')
        .subscribe((newNode: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.writeNodeCreateToYDoc(newNode);
          this.ctx.updateAttachedMap();
          this.mmpService.selectNode(newNode.id);
          this.mmpService.editNode();
        })
    );
  }

  private setupPasteHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodePaste')
        .subscribe((newNodes: ExportNodeProperties[]) => {
          if (!this.yDoc) return;
          this.writeNodesPasteToYDoc(newNodes);
          this.ctx.updateAttachedMap();
        })
    );
  }

  private setupNodeRemoveHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeRemove')
        .subscribe((removedNode: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.writeNodeRemoveFromYDoc(removedNode.id);
          this.ctx.updateAttachedMap();
        })
    );
  }

  // ─── Write operations (MMP → Y.Doc) ────────────────────────

  private writeNodeCreateToYDoc(nodeProps: ExportNodeProperties): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    this.yDoc.transact(() => {
      const yNode = new Y.Map<unknown>();
      populateYMapFromNodeProps(yNode, nodeProps);
      nodesMap.set(nodeProps.id, yNode);
    }, 'local');
  }

  private writeNodeUpdateToYDoc(event: NodeUpdateEvent): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    const yNode = nodesMap.get(event.nodeProperties.id);
    if (!yNode) return;

    this.yDoc.transact(() => {
      const topLevelKey = NodePropertyMapping[event.changedProperty][0];
      const value =
        event.nodeProperties[topLevelKey as keyof ExportNodeProperties];
      yNode.set(topLevelKey, value);
    }, 'local');
  }

  private writeNodeRemoveFromYDoc(nodeId: string): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    if (!nodesMap.has(nodeId)) return;

    const descendantIds = collectDescendantIds(nodesMap, nodeId);

    this.yDoc.transact(() => {
      nodesMap.delete(nodeId);
      for (const id of descendantIds) {
        nodesMap.delete(id);
      }
    }, 'local');
  }

  private writeNodesPasteToYDoc(nodes: ExportNodeProperties[]): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    this.yDoc.transact(() => {
      for (const node of nodes) {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, node);
        nodesMap.set(node.id, yNode);
      }
    }, 'local');
  }

  private writeFullMapToYDoc(operation: FullMapOperation): void {
    const snapshot = this.mmpService.exportAsJSON();
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    const sorted = sortParentFirst(snapshot);

    // Without this, Yjs merges the replacement with whatever the user did in
    // the preceding half second and one undo would revert both.
    this.yUndoManager?.stopCapturing();

    this.yDoc.transact(() => {
      this.yDoc.getMap('meta').set(LAST_FULL_MAP_OPERATION, operation);
      this.clearAndRepopulateNodes(nodesMap, sorted);
    }, operation);
  }

  private lastFullMapOperation(): FullMapOperation {
    const recorded = this.yDoc.getMap('meta').get(LAST_FULL_MAP_OPERATION);

    return recorded === 'distribute' ? 'distribute' : 'import';
  }

  private clearAndRepopulateNodes(
    nodesMap: Y.Map<Y.Map<unknown>>,
    snapshot: ExportNodeProperties[]
  ): void {
    for (const key of Array.from(nodesMap.keys())) {
      nodesMap.delete(key);
    }
    for (const node of snapshot) {
      const yNode = new Y.Map<unknown>();
      populateYMapFromNodeProps(yNode, node);
      nodesMap.set(node.id, yNode);
    }
  }

  private writeMapOptionsToYDoc(options?: CachedMapOptions): void {
    if (!this.yDoc || !options) return;
    const optionsMap = this.yDoc.getMap('mapOptions');
    this.yDoc.transact(() => {
      optionsMap.set('fontMaxSize', options.fontMaxSize);
      optionsMap.set('fontMinSize', options.fontMinSize);
      optionsMap.set('fontIncrement', options.fontIncrement);
    }, 'local');
  }

  private async deleteMapViaHttp(adminId: string): Promise<void> {
    const mapId = this.ctx.getAttachedMap().cachedMap.uuid;
    await this.httpService.delete(
      API_URL.ROOT,
      `/maps/${mapId}`,
      JSON.stringify({ adminId })
    );
  }

  // ─── Y.Doc observers (Y.Doc → MMP) ─────────────────────────

  private setupNodesObserver(): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    this.yjsNodesObserver = (
      events: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>[],
      transaction: Y.Transaction
    ) => {
      if (transaction.local && transaction.origin !== this.yUndoManager) return;
      for (const event of events) {
        this.handleNodeEvent(event, nodesMap);
      }
    };
    nodesMap.observeDeep(this.yjsNodesObserver);
  }

  private handleNodeEvent(
    event: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>,
    nodesMap: Y.Map<Y.Map<unknown>>
  ): void {
    if (event.target === nodesMap) {
      this.handleTopLevelNodeChanges(event, nodesMap);
    } else {
      this.handleNodePropertyChanges(event);
    }
  }

  private handleTopLevelNodeChanges(
    event: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>,
    nodesMap: Y.Map<Y.Map<unknown>>
  ): void {
    const mapEvent = event as unknown as Y.YMapEvent<Y.Map<unknown>>;

    if (this.isFullMapReplacement(mapEvent, nodesMap)) {
      this.loadMapFromYDoc();
      // A redistribution replaces the map the way an import does, but must not
      // be announced as one.
      if (this.lastFullMapOperation() !== 'distribute') {
        this.showImportToast();
      }
      return;
    }

    const adds: string[] = [];

    mapEvent.keysChanged.forEach(key => {
      const change = mapEvent.changes.keys.get(key);
      if (!change) return;

      if (change.action === 'add') {
        adds.push(key);
      } else if (change.action === 'update') {
        this.applyRemoteNodeDelete(key);
        this.applyRemoteNodeAdd(nodesMap.get(key));
      } else if (change.action === 'delete') {
        this.applyRemoteNodeDelete(key);
      }
    });

    if (adds.length > 0) {
      const nodeProps = adds
        .map(key => nodesMap.get(key))
        .filter((yNode): yNode is Y.Map<unknown> => !!yNode)
        .map(yNode => yMapToNodeProps(yNode));
      const sorted = sortParentFirst(nodeProps);
      sorted.forEach(props => this.mmpService.addNodesFromServer([props]));
    }
  }

  private async showImportToast(): Promise<void> {
    const msg = await this.utilsService.translate('TOASTS.MAP_IMPORT_SUCCESS');
    if (msg) this.toastrService.success(msg);
  }

  private isFullMapReplacement(
    mapEvent: Y.YMapEvent<Y.Map<unknown>>,
    nodesMap: Y.Map<Y.Map<unknown>>
  ): boolean {
    for (const [key, change] of mapEvent.changes.keys) {
      if (change.action === 'add' || change.action === 'update') {
        const yNode = nodesMap.get(key);
        if (yNode?.get('isRoot')) return true;
      }
    }
    return false;
  }

  private handleNodePropertyChanges(
    event: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>
  ): void {
    const yNode = event.target as unknown as Y.Map<unknown>;
    const nodeId = yNode.get('id') as string;
    if (!nodeId || !this.mmpService.existNode(nodeId)) return;

    const mapEvent = event as unknown as Y.YMapEvent<unknown>;
    mapEvent.keysChanged.forEach(key => {
      this.applyYDocPropertyToMmp(nodeId, key, yNode.get(key));
    });
  }

  private applyRemoteNodeAdd(yNode: Y.Map<unknown>): void {
    if (!yNode) return;
    const nodeProps = yMapToNodeProps(yNode);
    this.mmpService.addNodesFromServer([nodeProps]);
  }

  private applyRemoteNodeDelete(nodeId: string): void {
    if (this.mmpService.existNode(nodeId)) {
      this.mmpService.removeNode(nodeId, false);
    }
  }

  private applyYDocPropertyToMmp(
    nodeId: string,
    yjsKey: string,
    value: unknown
  ): void {
    for (const update of resolveMmpPropertyUpdate(yjsKey, value)) {
      this.mmpService.updateNode(update.prop, update.val, false, false, nodeId);
    }
  }

  private setupMapOptionsObserver(): void {
    const optionsMap = this.yDoc.getMap('mapOptions');
    this.yjsOptionsObserver = (_: unknown, transaction: Y.Transaction) => {
      if (transaction.local && transaction.origin !== this.yUndoManager) return;
      this.applyRemoteMapOptions();
    };
    optionsMap.observe(this.yjsOptionsObserver);
  }

  private applyRemoteMapOptions(): void {
    const optionsMap = this.yDoc.getMap('mapOptions');
    const options: CachedMapOptions = {
      fontMaxSize: (optionsMap.get('fontMaxSize') as number) ?? 28,
      fontMinSize: (optionsMap.get('fontMinSize') as number) ?? 6,
      fontIncrement: (optionsMap.get('fontIncrement') as number) ?? 2,
    };
    this.mmpService.updateAdditionalMapOptions(options);
  }

  // ─── Awareness (presence, selection, client list) ───────────

  private setupAwareness(): void {
    const awareness = this.wsProvider.awareness;
    const color = this.pickClientColor(awareness);
    this.ctx.setClientColor(color);

    awareness.setLocalStateField('user', {
      color,
      selectedNodeId: null,
    });

    this.yjsAwarenessHandler = () => {
      this.updateFromAwareness();
    };
    awareness.on('change', this.yjsAwarenessHandler);

    // Process awareness states already received before the listener
    this.updateFromAwareness();
  }

  private pickClientColor(awareness: WebsocketProvider['awareness']): string {
    const usedColors = new Set<string>();
    for (const [, state] of awareness.getStates()) {
      if (state?.user?.color) usedColors.add(state.user.color);
    }
    return resolveClientColor(this.ctx.getClientColor(), usedColors);
  }

  private updateAwarenessSelection(nodeId: string | null): void {
    if (!this.wsProvider) return;
    this.wsProvider.awareness.setLocalStateField('user', {
      color: this.ctx.getClientColor(),
      selectedNodeId: nodeId,
    });
  }

  private updateFromAwareness(): void {
    const newMapping = this.buildColorMappingFromAwareness();
    const affectedNodes = findAffectedNodes(
      this.ctx.getColorMapping(),
      newMapping
    );
    this.ctx.setColorMapping(newMapping);
    this.rehighlightNodes(affectedNodes);
    this.ctx.emitClientList();
  }

  private buildColorMappingFromAwareness(): ClientColorMapping {
    const awareness = this.wsProvider.awareness;
    const localClientId = this.yDoc.clientID;
    const mapping: ClientColorMapping = {};

    for (const [clientId, state] of awareness.getStates()) {
      if (!state?.user) continue;
      const isSelf = clientId === localClientId;
      mapping[String(clientId)] = {
        color: isSelf ? DEFAULT_SELF_COLOR : state.user.color || DEFAULT_COLOR,
        nodeId: state.user.selectedNodeId || '',
      };
    }
    return mapping;
  }

  private rehighlightNodes(nodeIds: Set<string>): void {
    for (const nodeId of nodeIds) {
      if (!this.mmpService.existNode(nodeId)) continue;
      const color = this.ctx.colorForNode(nodeId);
      this.mmpService.highlightNode(nodeId, color, false);
    }
  }
}

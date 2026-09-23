import { Subscription } from 'rxjs';
import { NodePropertyMapping } from '@teammapper/mmp';
import {
  CachedMapOptions,
  ExportNodeProperties,
  MapCreateEvent,
  NodeUpdateEvent,
  sortNodesParentFirst,
} from '@teammapper/shared';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { API_URL, HttpService } from '../../http/http.service';
import {
  ClientColorMapping,
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  resolveClientColor,
  findAffectedNodes,
  resolveMmpPropertyUpdate,
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

/** Doc-level metadata, shared with peers alongside the nodes themselves. */
const META = 'meta';

/**
 * The most recent full-map announcement broadcast to peers. Only meaningful
 * read inside the transaction that wrote it - the value it leaves behind
 * describes a past operation, not the one being applied.
 */
const LAST_MAP_ANNOUNCEMENT = 'lastMapAnnouncement';

/**
 * The origin every write of ours carries, and the only one the undo manager
 * tracks. A peer's change arrives with the WebsocketProvider as its origin,
 * so it is never ours to undo.
 */
const LOCAL_ORIGIN = 'local';

/**
 * Orders the nodes of a whole map parent-first across every root, then
 * appends the orphans no root reaches, in input order.
 */
function parentFirstWithOrphans(
  nodes: ExportNodeProperties[]
): ExportNodeProperties[] {
  const { ordered, unreached } = sortNodesParentFirst(nodes);
  return [...ordered, ...unreached];
}

/**
 * Orders a batch of added nodes parent-first. A node whose parent is outside
 * the batch, such as the top of a subtree pasted under a node this client
 * already holds, starts a walk as if it were a root.
 */
function batchParentFirst(
  nodes: ExportNodeProperties[]
): ExportNodeProperties[] {
  const batchIds = new Set(nodes.map(n => n.id));
  const keys = nodes.map(node => ({
    node,
    id: node.id,
    parent: node.parent && batchIds.has(node.parent) ? node.parent : null,
    isRoot: node.isRoot,
  }));
  const { ordered, unreached } = sortNodesParentFirst(keys);
  return [...ordered, ...unreached].map(key => key.node);
}

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

  /**
   * The Y.Doc of the open connection. initMap creates it, and the reads and
   * writes below run after that.
   */
  private get doc(): Y.Doc {
    if (!this.yDoc) {
      throw new Error('The map connection has no Y.Doc');
    }
    return this.yDoc;
  }

  /**
   * The nodes of the open connection, typed once instead of at every read.
   */
  private get nodesMap(): Y.Map<Y.Map<unknown>> {
    return this.doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  }

  /**
   * The websocket provider of the open connection. initMap creates it.
   */
  private get provider(): WebsocketProvider {
    if (!this.wsProvider) {
      throw new Error('The map connection has no websocket provider');
    }
    return this.wsProvider;
  }

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
    const provider = this.setupConnection(uuid);
    this.setupConnectionStatus(provider);
    this.setupMapDeletionHandler(provider);
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

  private setupConnection(mapId: string): WebsocketProvider {
    const wsUrl = buildYjsWsUrl();
    const provider = new WebsocketProvider(wsUrl, mapId, this.doc, {
      params: { secret: this.ctx.getModificationSecret() },
      maxBackoffTime: 5000,
      disableBc: true,
    });
    this.wsProvider = provider;

    provider.on('sync', (synced: boolean) => {
      if (!this.isCurrentProvider(provider)) return;
      if (synced && !this.yjsSynced) {
        this.handleFirstSync();
      }
    });

    return provider;
  }

  /**
   * Whether this provider is still the open connection. destroy() clears
   * `wsProvider` before it disconnects, and disconnecting emits both 'status'
   * and 'connection-close'. Those events therefore arrive for a provider that
   * is already gone, and acting on them reports the map we just left as
   * disconnected.
   */
  private isCurrentProvider(provider: WebsocketProvider): boolean {
    return this.wsProvider === provider;
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
    const undoManager = new Y.UndoManager(this.nodesMap, {
      // Everything we write is undoable, full-map replacements included: a
      // distribute reverts the layout, an import restores the map it replaced.
      // Merely opening a map is not a write - see setupCreateHandler.
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    this.yUndoManager = undoManager;
    this.setupUndoManagerListeners(undoManager);
  }

  private setupUndoManagerListeners(undoManager: Y.UndoManager): void {
    const updateUndoRedoState = () => {
      this.ctx.setCanUndo(undoManager.undoStack.length > 0);
      this.ctx.setCanRedo(undoManager.redoStack.length > 0);
    };

    undoManager.on('stack-item-added', updateUndoRedoState);
    undoManager.on('stack-item-popped', updateUndoRedoState);
    undoManager.on('stack-cleared', updateUndoRedoState);
  }

  private setupConnectionStatus(provider: WebsocketProvider): void {
    provider.on(
      'status',
      (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (!this.isCurrentProvider(provider)) return;
        if (event.status === 'connected') {
          this.ctx.setConnectionStatus('connected');
        } else if (event.status === 'disconnected') {
          this.ctx.setConnectionStatus('disconnected');
        }
      }
    );
  }

  private setupMapDeletionHandler(provider: WebsocketProvider): void {
    provider.on('connection-close', (event: CloseEvent | null) => {
      if (!this.isCurrentProvider(provider)) return;
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
    // Reset to the pre-connection state. A leftover 'disconnected' would
    // reopen the connection-lost dialog over the next map.
    this.ctx.setConnectionStatus(null);
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
    const snapshot = this.extractSnapshotFromYDoc(this.nodesMap);
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
    return parentFirstWithOrphans(nodes);
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

  /**
   * An import replaces the whole map, so it goes out as a full-map
   * replacement. Opening a map emits `create` too, but never reaches the undo
   * stack: MapSyncService.initMap emits it before subscribing here, and
   * loadMapFromYDoc replays the map with notifyWithEvent = false.
   */
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

    // A deselect leaves nothing selected until a nodeSelect follows, so peers
    // see no selection for this client and draw no ring for it.
    this.yjsSubscriptions.push(
      this.mmpService.on('nodeDeselect').subscribe(() => {
        if (!this.yDoc) return;
        this.updateAwarenessSelection(null);
        this.ctx.setAttachedNode(null);
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
    const nodesMap = this.nodesMap;
    this.doc.transact(() => {
      const yNode = new Y.Map<unknown>();
      populateYMapFromNodeProps(yNode, nodeProps);
      nodesMap.set(nodeProps.id, yNode);
    }, LOCAL_ORIGIN);
  }

  private writeNodeUpdateToYDoc(event: NodeUpdateEvent): void {
    const nodesMap = this.nodesMap;
    const yNode = nodesMap.get(event.nodeProperties.id);
    if (!yNode) return;

    this.doc.transact(() => {
      const topLevelKey =
        NodePropertyMapping[
          event.changedProperty as keyof typeof NodePropertyMapping
        ][0];
      const value =
        event.nodeProperties[topLevelKey as keyof ExportNodeProperties];
      yNode.set(topLevelKey, value);
    }, LOCAL_ORIGIN);
  }

  private writeNodeRemoveFromYDoc(nodeId: string): void {
    const nodesMap = this.nodesMap;
    if (!nodesMap.has(nodeId)) return;

    const descendantIds = collectDescendantIds(nodesMap, nodeId);

    this.doc.transact(() => {
      nodesMap.delete(nodeId);
      for (const id of descendantIds) {
        nodesMap.delete(id);
      }
    }, LOCAL_ORIGIN);
  }

  private writeNodesPasteToYDoc(nodes: ExportNodeProperties[]): void {
    const nodesMap = this.nodesMap;
    this.doc.transact(() => {
      for (const node of nodes) {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, node);
        nodesMap.set(node.id, yNode);
      }
    }, LOCAL_ORIGIN);
  }

  private writeFullMapToYDoc(operation: FullMapOperation): void {
    const snapshot = this.mmpService.exportAsJSON();
    const nodesMap = this.nodesMap;
    const sorted = parentFirstWithOrphans(snapshot);

    // Without this, Yjs merges the replacement with whatever the user did in
    // the preceding half second and one undo would revert both.
    this.yUndoManager?.stopCapturing();

    this.doc.transact(() => {
      this.doc.getMap(META).set(LAST_MAP_ANNOUNCEMENT, operation);
      this.clearAndRepopulateNodes(nodesMap, sorted);
    }, LOCAL_ORIGIN);
  }

  /**
   * A redistribution replaces the map the way an import does, and an undo
   * replays the nodes without recording an operation at all. Only a deliberate
   * replacement announces itself in the same transaction as the nodes, so the
   * announcement is read per key: an unrelated write to `meta` is not one.
   */
  private shouldAnnounceImport(mapEvent: Y.YMapEvent<Y.Map<unknown>>): boolean {
    const meta = this.doc.getMap(META);
    // Yjs keys `transaction.changed` by an erased `AbstractType`, which no
    // concrete `Y.Map` satisfies. The lookup compares object identity.
    const announced = mapEvent.transaction.changed.get(
      meta as unknown as Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>
    );
    if (!announced?.has(LAST_MAP_ANNOUNCEMENT)) return false;

    return meta.get(LAST_MAP_ANNOUNCEMENT) !== 'distribute';
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
    // The settings page can change these with no map open, so this is the one
    // write that has to tolerate a missing doc rather than throw.
    const doc = this.yDoc;
    if (!doc || !options) return;

    const optionsMap = doc.getMap('mapOptions');
    doc.transact(() => {
      optionsMap.set('fontMaxSize', options.fontMaxSize);
      optionsMap.set('fontMinSize', options.fontMinSize);
      optionsMap.set('fontIncrement', options.fontIncrement);
    }, LOCAL_ORIGIN);
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
    const nodesMap = this.nodesMap;
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
    // `event.target` carries the same erased `AbstractType`.
    if ((event.target as unknown) === nodesMap) {
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
      // A peer replaced the whole map, so our history describes a map that no
      // longer exists. A replacement is a delete-and-reinsert that no CRDT can
      // merge back, so undoing into it would leave the map with two roots.
      if (!mapEvent.transaction.local) this.yUndoManager?.clear();
      if (this.shouldAnnounceImport(mapEvent)) {
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
      const sorted = batchParentFirst(nodeProps);
      sorted.forEach(props => this.mmpService.addNodesFromServer([props]));
    }
  }

  private async showImportToast(): Promise<void> {
    const msg = await this.utilsService.translate('TOASTS.MAP_IMPORT_SUCCESS');
    if (msg) this.toastrService.success(msg);
  }

  /**
   * Reads `isRoot`, which marks the main root only. Adding a tree or pasting
   * one writes roots without the mark, so the check fires only when a
   * transaction rewrites the main root's entry: an import, a redistribution,
   * or an undo of either. Yjs reports a delete and re-set of one key as
   * `update`, so the check reads `add` and `update`.
   */
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

  private applyRemoteNodeAdd(yNode: Y.Map<unknown> | undefined): void {
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
    const optionsMap = this.doc.getMap('mapOptions');
    this.yjsOptionsObserver = (_: unknown, transaction: Y.Transaction) => {
      if (transaction.local && transaction.origin !== this.yUndoManager) return;
      this.applyRemoteMapOptions();
    };
    optionsMap.observe(this.yjsOptionsObserver);
  }

  private applyRemoteMapOptions(): void {
    const optionsMap = this.doc.getMap('mapOptions');
    const options: CachedMapOptions = {
      fontMaxSize: (optionsMap.get('fontMaxSize') as number) ?? 28,
      fontMinSize: (optionsMap.get('fontMinSize') as number) ?? 6,
      fontIncrement: (optionsMap.get('fontIncrement') as number) ?? 2,
    };
    this.mmpService.updateAdditionalMapOptions(options);
  }

  // ─── Awareness (presence, selection, client list) ───────────

  private setupAwareness(): void {
    const awareness = this.provider.awareness;
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
    const awareness = this.provider.awareness;
    const localClientId = this.doc.clientID;
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

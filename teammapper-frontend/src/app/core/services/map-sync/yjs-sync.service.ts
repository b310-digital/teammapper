import { auditTime, Subscription } from 'rxjs';
import {
  CachedMapOptions,
  DEFAULT_FONT_MAX_SIZE,
  ExportNodeProperties,
} from '@teammapper/shared';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import {
  ClientColorMapping,
  buildYjsWsUrl,
  buildYjsProtocols,
  resolveClientColor,
  findAffectedNodes,
  NodesMap,
  nodesMapOf,
} from './yjs-utils';
import {
  MapSyncContext,
  DEFAULT_COLOR,
  DEFAULT_SELF_COLOR,
} from './map-sync-context';
import {
  LAST_MAP_ANNOUNCEMENT,
  LOCAL_ORIGIN,
  META,
  YjsMapData,
  replacesMainRoot,
} from './yjs-map-data';

const WS_CLOSE_MAP_DELETED = 4001;

/** The value when it is a non-empty string, and the fallback otherwise. */
const stringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value !== '' ? value : fallback;

/** The longest the cached map lags behind a change of the map data. */
export const ATTACHED_MAP_AUDIT_MS = 250;

/**
 * Keeps one open map in sync with the other clients over a Yjs websocket.
 * The Y.Doc holds the only copy of the map, and mmp reads and writes it
 * through `YjsMapData`. The service owns the connection, presence, the undo
 * manager and the import notice. `MapSyncService` calls `initMap` and then
 * `attachMap`.
 */
export class YjsSyncService {
  private yDoc: Y.Doc | null = null;
  private yjsMapData: YjsMapData | null = null;
  private wsProvider: WebsocketProvider | null = null;
  private yjsSynced = false;
  private yjsWritable = false;
  private yjsSubscriptions: Subscription[] = [];
  private yjsMapId: string | null = null;
  private yjsNodesObserver: Parameters<NodesMap['observe']>[0] | null = null;
  private yjsOptionsObserver: Parameters<Y.Map<unknown>['observe']>[0] | null =
    null;
  private yjsAwarenessHandler: (() => void) | null = null;
  private yUndoManager: Y.UndoManager | null = null;
  // The node this client has selected, which setupAwareness publishes once
  // awareness is up.
  private selectedNodeId: string | null = null;

  constructor(
    private ctx: MapSyncContext,
    private mmpService: MmpService,
    private settingsService: SettingsService,
    private utilsService: UtilsService,
    private toastrService: ToastrService
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

  /** The nodes of the open connection. */
  private get nodesMap(): NodesMap {
    return nodesMapOf(this.doc);
  }

  /**
   * The map data over the Y.Doc of the open connection. initMap creates it
   * together with the doc.
   */
  private get mapData(): YjsMapData {
    if (!this.yjsMapData) {
      throw new Error('The map connection has no map data');
    }
    return this.yjsMapData;
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

  /**
   * Sets whether this client may edit the map. Edit mode follows this value from
   * the first sync on, whichever of the sync and this call comes first.
   */
  setWritable(writable: boolean): void {
    this.yjsWritable = writable;
    if (this.yjsSynced) this.settingsService.setEditMode(writable);
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

  // ─── Connection lifecycle ───────────────────────────────────

  /**
   * Open the connection to a map, or reattach to the open one. The first
   * sync hands the map data to the context, which creates the map over it
   * and then calls `attachMap`. An open connection that has synced hands its
   * map data over before `initMap` returns.
   */
  initMap(uuid: string): void {
    if (this.hasActiveConnection(uuid)) {
      if (this.yjsSynced) this.handOverMapData();
      return;
    }

    this.yjsMapId = uuid;
    this.yDoc = new Y.Doc();
    // Define `meta` as a map before the first sync. A peer's write would
    // otherwise create it as a bare type, and the first getMap call would
    // swap in a new object that no transaction's `changed` list contains.
    this.yDoc.getMap(META);
    this.yjsMapData = new YjsMapData(this.yDoc, () => this.yUndoManager);
    const provider = this.setupConnection(uuid);
    this.setupConnectionStatus(provider);
    this.setupMapDeletionHandler(provider);
  }

  /**
   * Wire the map the context created over the map data: the mmp listeners,
   * the selection, the observers, awareness and the undo manager, and last
   * edit mode, so the map exists when edit mode reaches it.
   */
  attachMap(): void {
    this.detachObservers();
    this.createListeners();
    this.attachSelection();
    this.setupNodesObserver();
    this.setupMapOptionsObserver();
    if (!this.yUndoManager) this.initUndoManager();
    this.setupAwareness();
    this.settingsService.setEditMode(this.yjsWritable);
  }

  private hasActiveConnection(mapId: string): boolean {
    return (
      this.yDoc !== null && this.wsProvider !== null && this.yjsMapId === mapId
    );
  }

  private setupConnection(mapId: string): WebsocketProvider {
    const wsUrl = buildYjsWsUrl();
    const provider = new WebsocketProvider(wsUrl, mapId, this.doc, {
      protocols: buildYjsProtocols(this.ctx.getModificationSecret()),
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

  /**
   * The map exists from the first sync on, an empty doc included: the
   * context creates it over the map data.
   */
  private handleFirstSync(): void {
    this.yjsSynced = true;
    this.handOverMapData();
  }

  /** Report the connection as connected and let the context create the map. */
  private handOverMapData(): void {
    this.ctx.setConnectionStatus('connected');
    this.ctx.createMap(this.mapData);
  }

  private initUndoManager(): void {
    const undoManager = new Y.UndoManager(this.nodesMap, {
      // Everything we write is undoable, an import included: its undo
      // restores the map it replaced. Opening a map writes nothing, since
      // mmp reads the doc through the map data.
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
        this.ctx.mapDeleted();
        window.location.reload();
      }
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────

  /**
   * Close the connection. Edit mode keeps its value, because the settings
   * page reads it to decide whether the map settings of the map the user
   * left stay editable.
   */
  destroy(): void {
    this.unsubscribeListeners();
    this.detachObservers();
    this.destroyUndoManager();
    this.destroyConnection();
    this.yjsSynced = false;
    this.yjsWritable = false;
    this.yjsMapId = null;
    this.selectedNodeId = null;
    // Reset to the pre-connection state. A leftover 'disconnected' would
    // reopen the connection-lost dialog over the next map.
    this.ctx.setConnectionStatus(null);
  }

  private destroyUndoManager(): void {
    if (!this.yUndoManager) return;
    this.yUndoManager.destroy();
    this.yUndoManager = null;
    this.ctx.setCanUndo(false);
    this.ctx.setCanRedo(false);
  }

  private destroyConnection(): void {
    const provider = this.wsProvider;
    this.wsProvider = null;
    if (provider) {
      provider.disconnect();
      provider.destroy();
    }
    this.yjsMapData?.destroy();
    this.yjsMapData = null;
    this.yDoc?.destroy();
    this.yDoc = null;
  }

  private detachObservers(): void {
    if (this.yDoc && this.yjsNodesObserver) {
      this.nodesMap.unobserve(this.yjsNodesObserver);
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

  // ─── mmp event listeners ────────────────────────────────────

  private createListeners(): void {
    this.unsubscribeListeners();
    this.setupMapChangeHandler();
    this.setupSelectionHandlers();
  }

  /**
   * mmp draws every change of the map data, local or remote, and then emits
   * `mapChange`. The attached node follows every change, so the panels
   * never show the values from before it. The cached map exports the whole
   * map, so it follows at most once per `ATTACHED_MAP_AUDIT_MS`, with the
   * state after the last change; a peer's burst of writes or a color picker
   * drag then exports once instead of per write.
   */
  private setupMapChangeHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('mapChange')
        .subscribe(() =>
          this.ctx.setAttachedNode(this.mmpService.selectNode())
        ),
      this.mmpService
        .on('mapChange')
        .pipe(auditTime(ATTACHED_MAP_AUDIT_MS))
        .subscribe(() => void this.ctx.updateAttachedMap())
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

  /**
   * Take over the selection the map made when it was created. Its
   * `nodeSelect` fired before the listeners above existed.
   */
  private attachSelection(): void {
    const selected = this.mmpService.selectNode();
    this.ctx.setAttachedNode(selected);
    this.updateAwarenessSelection(selected?.id ?? null);
  }

  // ─── Map options (Y.Doc ↔ MMP) ──────────────────────────────

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
      fontMaxSize:
        (optionsMap.get('fontMaxSize') as number) ?? DEFAULT_FONT_MAX_SIZE,
      fontMinSize: (optionsMap.get('fontMinSize') as number) ?? 6,
      fontIncrement: (optionsMap.get('fontIncrement') as number) ?? 2,
    };
    this.mmpService.updateAdditionalMapOptions(options);
  }

  // ─── A peer's map replacement ───────────────────────────────

  /**
   * Watch for a peer replacing the whole map. mmp learns of the new nodes
   * through the map data, so this observer only clears the undo stack and
   * announces an import. Our own transactions, an undo included, need
   * neither: ImportService shows its own toast for a local import.
   */
  private setupNodesObserver(): void {
    const nodesMap = this.nodesMap;
    this.yjsNodesObserver = (event, transaction) => {
      if (transaction.local) return;
      if (!replacesMainRoot(event.changes.keys, nodesMap)) return;
      // A peer replaced the whole map, so our history describes a map that no
      // longer exists. A replacement is a delete-and-reinsert that no CRDT can
      // merge back, so undoing into it would leave the map with two roots.
      this.yUndoManager?.clear();
      if (this.announcesImport(transaction)) void this.showImportToast();
    };
    nodesMap.observe(this.yjsNodesObserver);
  }

  /**
   * An undo replays the nodes and writes no announcement. An import writes
   * `LAST_MAP_ANNOUNCEMENT` in the same transaction as the nodes, so the
   * method checks that this transaction changed that key: a write to another
   * key of `meta` announces nothing.
   */
  private announcesImport(transaction: Y.Transaction): boolean {
    const meta = this.doc.getMap(META);
    // Yjs keys `transaction.changed` by an erased `AbstractType`, which no
    // concrete `Y.Map` satisfies. The lookup compares object identity.
    const announced = transaction.changed.get(
      meta as unknown as Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>
    );
    if (!announced?.has(LAST_MAP_ANNOUNCEMENT)) return false;

    return meta.get(LAST_MAP_ANNOUNCEMENT) === 'import';
  }

  private async showImportToast(): Promise<void> {
    const msg = await this.utilsService.translate('TOASTS.MAP_IMPORT_SUCCESS');
    if (msg) this.toastrService.success(msg);
  }

  // ─── Awareness (presence, selection, client list) ───────────

  private setupAwareness(): void {
    const awareness = this.provider.awareness;
    const color = this.pickClientColor(awareness);
    this.ctx.setClientColor(color);

    awareness.setLocalStateField('user', {
      color,
      selectedNodeId: this.selectedNodeId,
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
    this.selectedNodeId = nodeId;
    // Until setupAwareness runs, the method only records the selection, and
    // setupAwareness publishes it. A write before then would make
    // pickClientColor count this client's own colour as taken.
    if (!this.wsProvider || this.yjsAwarenessHandler === null) return;
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

  /**
   * The color and selected node of every client. Any peer, a read-only one
   * included, writes its own awareness state, so a value that is no string
   * falls back to the default instead of reaching mmp.
   */
  private buildColorMappingFromAwareness(): ClientColorMapping {
    const awareness = this.provider.awareness;
    const localClientId = this.doc.clientID;
    const mapping: ClientColorMapping = {};

    for (const [clientId, state] of awareness.getStates()) {
      if (!state?.user) continue;
      const isSelf = clientId === localClientId;
      mapping[String(clientId)] = {
        color: isSelf
          ? DEFAULT_SELF_COLOR
          : stringOr(state.user.color, DEFAULT_COLOR),
        nodeId: stringOr(state.user.selectedNodeId, ''),
      };
    }
    return mapping;
  }

  private rehighlightNodes(nodeIds: Set<string>): void {
    for (const nodeId of nodeIds) {
      if (!this.mmpService.existNode(nodeId)) continue;
      const color = this.ctx.colorForNode(nodeId);
      this.mmpService.highlightNode(nodeId, color);
    }
  }
}

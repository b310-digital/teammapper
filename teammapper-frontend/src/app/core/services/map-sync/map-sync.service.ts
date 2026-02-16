import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import {
  CachedAdminMapEntry,
  CachedAdminMapValue,
  CachedMap,
  CachedMapEntry,
  CachedMapOptions,
} from '../../../shared/models/cached-map.model';
import { io, Socket } from 'socket.io-client';
import { NodePropertyMapping } from '@mmp/index';
import {
  ExportNodeProperties,
  MapCreateEvent,
  MapProperties,
  NodeUpdateEvent,
} from '@mmp/map/types';
import {
  PrivateServerMap,
  ResponseMapOptionsUpdated,
  ResponseMapUpdated,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseNodesAdded,
  ResponseSelectionUpdated,
  ResponseClientNotification,
  ServerMap,
  ServerMapInfo,
  ResponseUndoRedoChanges,
  ReversePropertyMapping,
  OperationResponse,
  ValidationErrorResponse,
  CriticalErrorResponse,
} from './server-types';
import { API_URL, HttpService } from '../../http/http.service';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { MapDiff, SnapshotChanges } from '@mmp/map/handlers/history';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';
import { environment } from '../../../../environments/environment';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  ClientColorMapping,
  ClientColorMappingValue,
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  parseWriteAccessBytes,
  resolveClientColor,
  findAffectedNodes,
  resolveMmpPropertyUpdate,
} from './yjs-utils';

const DEFAULT_COLOR = '#000000';
const DEFAULT_SELF_COLOR = '#c0c0c0';
const WS_CLOSE_MAP_DELETED = 4001;
const MESSAGE_WRITE_ACCESS = 4;

type ServerClientList = Record<string, string>;

export type ConnectionStatus = 'connected' | 'disconnected' | null;

@Injectable({
  providedIn: 'root',
})
export class MapSyncService implements OnDestroy {
  private mmpService = inject(MmpService);
  private httpService = inject(HttpService);
  private storageService = inject(StorageService);
  private settingsService = inject(SettingsService);
  utilsService = inject(UtilsService);
  toastrService = inject(ToastrService);
  private toastService = inject(ToastService);
  private dialogService = inject(DialogService);

  // needed in color panel to show all clients
  private readonly clientListSubject: BehaviorSubject<string[]>;
  // needed in map component to initialize when map is rendered and data present
  private readonly attachedMapSubject: BehaviorSubject<CachedMapEntry | null>;
  // needed in the application component for UI related tasks
  private readonly attachedNodeSubject: BehaviorSubject<ExportNodeProperties | null>;
  // inform other parts of the app about the connection state
  private readonly connectionStatusSubject: BehaviorSubject<ConnectionStatus>;

  // Socket.io fields (used when featureFlagYjs is false)
  private socket: Socket;

  // Yjs fields (used when featureFlagYjs is true)
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

  // Common fields
  private colorMapping: ClientColorMapping;
  private availableColors: string[];
  private clientColor: string;
  private modificationSecret: string;

  constructor() {
    // Initialization of the behavior subjects.
    this.attachedMapSubject = new BehaviorSubject<CachedMapEntry | null>(null);
    this.attachedNodeSubject = new BehaviorSubject<ExportNodeProperties | null>(
      null
    );
    this.connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(null);
    this.clientListSubject = new BehaviorSubject<string[]>([]);

    this.availableColors = COLORS;
    this.clientColor =
      this.availableColors[
        Math.floor(Math.random() * this.availableColors.length)
      ];
    this.modificationSecret = '';
    this.colorMapping = {};

    if (!environment.featureFlagYjs) {
      this.initSocketConnection();
    }
  }

  ngOnDestroy() {
    if (environment.featureFlagYjs) {
      this.resetYjs();
    } else {
      this.resetSocketIo();
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Creates a new map on server and prepares it locally
   * Stores admin data and enables edit mode
   */
  public async prepareNewMap(): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.postMapToServer();
    this.storePrivateMapData(privateServerMap);
    this.setupNewMapState(privateServerMap);
    return privateServerMap;
  }

  public async prepareExistingMap(
    id: string,
    modificationSecret: string
  ): Promise<ServerMap> {
    this.modificationSecret = modificationSecret;
    const serverMap = await this.fetchMapFromServer(id);

    if (!serverMap) {
      return;
    }

    this.updateCachedMapForAdmin(serverMap);
    this.prepareMap(serverMap);
    return serverMap;
  }

  // Detach MMP listeners but keep the Yjs connection alive for reuse
  public reset() {
    if (environment.featureFlagYjs) {
      this.detachYjsObservers();
      this.unsubscribeYjsListeners();
    } else {
      this.resetSocketIo();
    }
    this.colorMapping = {};
  }

  public initMap() {
    this.mmpService.new(this.getAttachedMap().cachedMap.data);
    this.attachedNodeSubject.next(
      this.mmpService.selectNode(this.mmpService.getRootNode().id)
    );

    if (environment.featureFlagYjs) {
      this.initYjs();
    } else {
      this.createSocketIoListeners();
      this.listenServerEvents(this.getAttachedMap().cachedMap.uuid);
    }
  }

  public attachMap(cachedMapEntry: CachedMapEntry): void {
    this.attachedMapSubject.next(cachedMapEntry);
  }

  public getAttachedMapObservable(): Observable<CachedMapEntry | null> {
    return this.attachedMapSubject.asObservable();
  }

  public getClientListObservable(): Observable<string[] | null> {
    return this.clientListSubject.asObservable();
  }

  public getAttachedNodeObservable(): Observable<ExportNodeProperties | null> {
    return this.attachedNodeSubject.asObservable();
  }

  public getConnectionStatusObservable(): Observable<ConnectionStatus> {
    return this.connectionStatusSubject.asObservable();
  }

  public getAttachedMap(): CachedMapEntry {
    return this.attachedMapSubject.getValue();
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatusSubject.getValue();
  }

  // update the attached map from outside control flow
  public async updateAttachedMap(): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();

    const cachedMap: CachedMap = {
      data: this.mmpService.exportAsJSON(),
      lastModified: Date.now(),
      createdAt: cachedMapEntry.cachedMap.createdAt,
      uuid: cachedMapEntry.cachedMap.uuid,
      deletedAt: cachedMapEntry.cachedMap.deletedAt,
      deleteAfterDays: cachedMapEntry.cachedMap.deleteAfterDays,
      options: cachedMapEntry.cachedMap.options,
    };

    this.attachMap({ key: cachedMapEntry.key, cachedMap });
  }

  public updateMapOptions(options?: CachedMapOptions) {
    if (environment.featureFlagYjs) {
      this.writeMapOptionsToYDoc(options);
    } else {
      this.emitUpdateMapOptions(options);
    }
  }

  public async deleteMap(adminId: string): Promise<void> {
    if (environment.featureFlagYjs) {
      await this.deleteMapViaHttp(adminId);
    } else {
      this.deleteMapViaSocket(adminId);
    }
  }

  public async fetchUserMapsFromServer(): Promise<CachedAdminMapEntry[]> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps');
    if (!response.ok) return [];
    const json: ServerMapInfo[] = await response.json();
    return json.map(map => ({
      id: map.uuid,
      cachedAdminMapValue: {
        adminId: map.adminId,
        modificationSecret: map.modificationSecret,
        ttl: map.ttl ? new Date(map.ttl) : new Date(),
        rootName: map.rootName,
      },
    }));
  }

  // ─── Socket.io initialization ────────────────────────────────

  private initSocketConnection(): void {
    const reconnectOptions = {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 60,
      randomizationFactor: 0.5,
    };

    const baseHref =
      document.querySelector('base')?.getAttribute('href') ?? '/';
    this.socket =
      baseHref !== '/'
        ? io('', {
            path: `${baseHref}socket.io`,
            ...reconnectOptions,
          })
        : io({
            ...reconnectOptions,
          });
  }

  private resetSocketIo(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.leaveMap();
    }
  }

  // ─── Socket.io map listeners (MMP → Socket.io) ──────────────

  private createSocketIoListeners() {
    this.setupSocketIoCreateHandler();
    this.setupSocketIoSelectionHandlers();
    this.setupSocketIoNodeUpdateHandler();
    this.setupSocketIoUndoRedoHandlers();
    this.setupSocketIoNodeCreateHandler();
    this.setupSocketIoPasteHandler();
    this.setupSocketIoNodeRemoveHandler();
  }

  private setupSocketIoCreateHandler(): void {
    this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      this.updateAttachedMap();
      this.updateMap();
    });
  }

  private setupSocketIoSelectionHandlers(): void {
    this.mmpService
      .on('nodeSelect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelectionSocketIo(nodeProps.id, true);
        this.attachedNodeSubject.next(nodeProps);
      });

    this.mmpService
      .on('nodeDeselect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelectionSocketIo(nodeProps.id, false);
        this.attachedNodeSubject.next(nodeProps);
      });
  }

  private setupSocketIoNodeUpdateHandler(): void {
    this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
      this.attachedNodeSubject.next(result.nodeProperties);
      this.emitUpdateNode(result);
      this.updateAttachedMap();
    });
  }

  private setupSocketIoUndoRedoHandlers(): void {
    this.mmpService.on('undo').subscribe((diff?: MapDiff) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      this.updateAttachedMap();
      this.emitApplyMapChangesByDiff(diff, 'undo');
    });

    this.mmpService.on('redo').subscribe((diff?: MapDiff) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      this.updateAttachedMap();
      this.emitApplyMapChangesByDiff(diff, 'redo');
    });
  }

  private setupSocketIoNodeCreateHandler(): void {
    this.mmpService
      .on('nodeCreate')
      .subscribe((newNode: ExportNodeProperties) => {
        this.emitAddNode(newNode);
        this.updateAttachedMap();
        this.mmpService.selectNode(newNode.id);
        this.mmpService.editNode();
      });
  }

  private setupSocketIoPasteHandler(): void {
    this.mmpService
      .on('nodePaste')
      .subscribe((newNodes: ExportNodeProperties[]) => {
        this.emitAddNodes(newNodes);
        this.updateAttachedMap();
      });
  }

  private setupSocketIoNodeRemoveHandler(): void {
    this.mmpService
      .on('nodeRemove')
      .subscribe((removedNode: ExportNodeProperties) => {
        this.emitRemoveNode(removedNode);
        this.updateAttachedMap();
      });
  }

  // ─── Socket.io emit methods ──────────────────────────────────

  private async joinMap(
    mmpUuid: string,
    color: string
  ): Promise<MapProperties> {
    return new Promise<MapProperties>((resolve, reject) => {
      this.socket.emit(
        'join',
        { mapId: mmpUuid, color },
        (serverMap: MapProperties) => {
          if (!serverMap) {
            reject('Server Map not available');
            return;
          }
          resolve(serverMap);
        }
      );
    });
  }

  private leaveMap() {
    this.socket.emit('leave');
  }

  private emitAddNode(newNode: ExportNodeProperties) {
    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'addNodes',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        nodes: [newNode],
        modificationSecret: this.modificationSecret,
      },
      async (response: OperationResponse<ExportNodeProperties[]>) => {
        await this.handleOperationResponse(response, 'add node');
      }
    );
  }

  /**
   * Add multiple nodes with server validation and error handling
   * Used for bulk operations like paste
   */
  private emitAddNodes(newNodes: ExportNodeProperties[]) {
    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'addNodes',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        nodes: newNodes,
        modificationSecret: this.modificationSecret,
      },
      async (response: OperationResponse<ExportNodeProperties[]>) => {
        await this.handleOperationResponse(response, 'add nodes');
      }
    );
  }

  /**
   * Update node property with server validation and error handling
   */
  private emitUpdateNode(nodeUpdate: NodeUpdateEvent) {
    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'updateNode',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        node: nodeUpdate.nodeProperties,
        updatedProperty: nodeUpdate.changedProperty,
        modificationSecret: this.modificationSecret,
      },
      async (response: OperationResponse<ExportNodeProperties>) => {
        await this.handleOperationResponse(response, 'update node');
      }
    );
  }

  /**
   * Remove node with server validation and error handling
   */
  private emitRemoveNode(removedNode: ExportNodeProperties) {
    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'removeNode',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        node: removedNode,
        modificationSecret: this.modificationSecret,
      },
      async (response: OperationResponse<ExportNodeProperties | null>) => {
        await this.handleOperationResponse(response, 'remove node');
      }
    );
  }

  /**
   * Apply undo/redo changes with server validation and error handling
   */
  private emitApplyMapChangesByDiff(
    diff: MapDiff,
    operationType: 'undo' | 'redo'
  ) {
    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'applyMapChangesByDiff',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        diff,
        modificationSecret: this.modificationSecret,
      },
      async (response: OperationResponse<MapDiff>) => {
        await this.handleOperationResponse(
          response,
          `${operationType} operation`
        );
      }
    );
  }

  private updateMap() {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMap', {
      mapId: cachedMapEntry.cachedMap.uuid,
      map: cachedMapEntry.cachedMap,
      modificationSecret: this.modificationSecret,
    });
  }

  private emitUpdateMapOptions(options?: CachedMapOptions) {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMapOptions', {
      mapId: cachedMapEntry.cachedMap.uuid,
      options,
      modificationSecret: this.modificationSecret,
    });
  }

  private deleteMapViaSocket(adminId: string): void {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('deleteMap', {
      adminId,
      mapId: cachedMapEntry.cachedMap.uuid,
    });
  }

  // Remember all clients selections with the dedicated colors to switch between colors when clients change among nodes
  private updateNodeSelectionSocketIo(id: string, selected: boolean) {
    if (selected) {
      this.colorMapping[this.socket.id] = {
        color: DEFAULT_SELF_COLOR,
        nodeId: id,
      };
    } else {
      this.colorMapping[this.socket.id] = {
        color: DEFAULT_SELF_COLOR,
        nodeId: '',
      };
      const colorForNode: string = this.colorForNode(id);
      if (colorForNode !== '')
        this.mmpService.highlightNode(id, colorForNode, false);
    }

    this.socket.emit('updateNodeSelection', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodeId: id,
      selected,
    });
  }

  private checkModificationSecret() {
    this.socket.emit(
      'checkModificationSecret',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        modificationSecret: this.modificationSecret,
      },
      (result: boolean) => this.settingsService.setEditMode(result)
    );
  }

  // ─── Socket.io server event handlers ─────────────────────────

  /**
   * Setup all server event listeners and join the map
   * Orchestrates socket event handlers for real-time collaboration
   */
  private listenServerEvents(uuid: string): Promise<MapProperties> {
    this.checkModificationSecret();
    this.setupReconnectionHandler(uuid);
    this.setupNotificationHandlers();
    this.setupNodeEventHandlers();
    this.setupMapEventHandlers();
    this.setupClientEventHandlers();
    this.setupConnectionEventHandlers();

    return this.joinMap(uuid, this.clientColor);
  }

  /**
   * Setup socket reconnection handler
   * Re-joins map and syncs state on reconnect
   */
  private setupReconnectionHandler(uuid: string): void {
    this.socket.io.on('reconnect', async () => {
      const serverMap: MapProperties = await this.joinMap(
        uuid,
        this.clientColor
      );
      this.setConnectionStatusSubject('connected');
      this.mmpService.new(serverMap.data, false);
    });
  }

  /**
   * Setup notification event handlers
   * Displays toasts for client notifications from server
   */
  private setupNotificationHandlers(): void {
    this.socket.on(
      'clientNotification',
      async (notification: ResponseClientNotification) => {
        if (notification.clientId === this.socket.id) return;
        await this.handleClientNotification(notification);
      }
    );
  }

  /**
   * Handle individual client notification
   * Translates message and shows appropriate toast type
   */
  private async handleClientNotification(
    notification: ResponseClientNotification
  ): Promise<void> {
    const msg = await this.utilsService.translate(notification.message);
    if (!msg) return;

    const toastHandlers: Record<string, () => void> = {
      error: () => this.toastrService.error(msg),
      success: () => this.toastrService.success(msg),
      warning: () => this.toastrService.warning(msg),
    };
    toastHandlers[notification.type]?.();
  }

  /**
   * Setup node-related event handlers
   * Handles node additions, updates, and removals
   */
  private setupNodeEventHandlers(): void {
    this.setupNodesAddedHandler();
    this.setupNodeUpdatedHandler();
    this.setupNodeRemovedHandler();
  }

  /**
   * Setup handler for nodes being added
   */
  private setupNodesAddedHandler(): void {
    this.socket.on('nodesAdded', (result: ResponseNodesAdded) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.addNodesFromServer(result.nodes);
    });
  }

  /**
   * Setup handler for node property updates
   */
  private setupNodeUpdatedHandler(): void {
    this.socket.on('nodeUpdated', (result: ResponseNodeUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.handleNodeUpdate(result);
    });
  }

  /**
   * Handle individual node property update
   */
  private handleNodeUpdate(result: ResponseNodeUpdated): void {
    const newNode = result.node;
    const existingNode = this.mmpService.getNode(newNode.id);
    const propertyPath = NodePropertyMapping[result.property];
    const changedValue = UtilsService.get(newNode, propertyPath);

    this.mmpService.updateNode(
      result.property,
      changedValue,
      false,
      true,
      existingNode.id
    );
  }

  /**
   * Setup handler for node removal
   */
  private setupNodeRemovedHandler(): void {
    this.socket.on('nodeRemoved', (result: ResponseNodeRemoved) => {
      if (result.clientId === this.socket.id) return;
      if (this.mmpService.existNode(result.nodeId)) {
        this.mmpService.removeNode(result.nodeId, false);
      }
    });
  }

  /**
   * Setup map-related event handlers
   * Handles map updates, undo/redo, and options
   */
  private setupMapEventHandlers(): void {
    this.setupMapUpdatedHandler();
    this.setupMapChangesHandler();
    this.setupMapOptionsHandler();
    this.setupMapDeletedHandler();
  }

  /**
   * Setup handler for full map updates
   */
  private setupMapUpdatedHandler(): void {
    this.socket.on('mapUpdated', (result: ResponseMapUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.new(result.map.data, false);
    });
  }

  /**
   * Setup handler for map undo/redo changes
   */
  private setupMapChangesHandler(): void {
    this.socket.on('mapChangesUndoRedo', (result: ResponseUndoRedoChanges) => {
      if (result.clientId === this.socket.id) return;
      this.applyMapDiff(result.diff);
    });
  }

  /**
   * Apply map diff for undo/redo operations
   */
  private applyMapDiff(diff: MapDiff): void {
    this.applyAddedNodes(diff.added);
    this.applyUpdatedNodes(diff.updated);
    this.applyDeletedNodes(diff.deleted);
  }

  /**
   * Apply added nodes from diff
   */
  private applyAddedNodes(added: SnapshotChanges): void {
    if (!added) return;
    for (const nodeId in added) {
      this.mmpService.addNode(added[nodeId], false);
    }
  }

  /**
   * Apply updated nodes from diff
   */
  private applyUpdatedNodes(updated: SnapshotChanges): void {
    if (!updated) return;
    for (const nodeId in updated) {
      if (this.mmpService.existNode(nodeId)) {
        this.applyNodePropertyUpdates(nodeId, updated[nodeId]);
      }
    }
  }

  /**
   * Apply property updates to a single node
   */
  private applyNodePropertyUpdates(
    nodeId: string,
    nodeUpdates: Partial<ExportNodeProperties>
  ): void {
    if (!nodeUpdates) return;

    for (const property in nodeUpdates) {
      const updatedProperty = this.getClientProperty(
        property,
        (nodeUpdates as Record<string, unknown>)[property]
      );
      if (updatedProperty) {
        this.mmpService.updateNode(
          updatedProperty.clientProperty,
          updatedProperty.directValue,
          false,
          true,
          nodeId
        );
      }
    }
  }

  /**
   * Convert server property to client property format
   */
  private getClientProperty(
    serverProperty: string,
    value: unknown
  ): { clientProperty: string; directValue: unknown } | undefined {
    const mapping =
      ReversePropertyMapping[
        serverProperty as keyof typeof ReversePropertyMapping
      ];

    if (typeof mapping === 'string') {
      return { clientProperty: mapping, directValue: value };
    }

    if (mapping && typeof value === 'object') {
      const subProperty = Object.keys(value)[0];
      const nestedMapping = mapping[
        subProperty as keyof typeof mapping
      ] as string;
      return { clientProperty: nestedMapping, directValue: value[subProperty] };
    }

    return;
  }

  /**
   * Apply deleted nodes from diff
   */
  private applyDeletedNodes(deleted: SnapshotChanges): void {
    if (!deleted) return;
    for (const nodeId in deleted) {
      if (this.mmpService.existNode(nodeId)) {
        this.mmpService.removeNode(nodeId, false);
      }
    }
  }

  /**
   * Setup handler for map options updates
   */
  private setupMapOptionsHandler(): void {
    this.socket.on('mapOptionsUpdated', (result: ResponseMapOptionsUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.updateAdditionalMapOptions(result.options);
    });
  }

  /**
   * Setup handler for map deletion
   */
  private setupMapDeletedHandler(): void {
    this.socket.on('mapDeleted', () => {
      window.location.reload();
    });
  }

  /**
   * Setup client-related event handlers
   * Handles selection updates and client list changes
   */
  private setupClientEventHandlers(): void {
    this.setupSelectionHandler();
    this.setupClientListHandler();
    this.setupClientDisconnectHandler();
  }

  /**
   * Setup handler for selection updates
   */
  private setupSelectionHandler(): void {
    this.socket.on('selectionUpdated', (result: ResponseSelectionUpdated) => {
      if (result.clientId === this.socket.id) return;
      if (!this.mmpService.existNode(result.nodeId)) return;
      this.handleSelectionUpdate(result);
    });
  }

  /**
   * Handle individual selection update
   */
  private handleSelectionUpdate(result: ResponseSelectionUpdated): void {
    this.ensureClientInMapping(result.clientId);
    this.updateClientNodeSelection(
      result.clientId,
      result.nodeId,
      result.selected
    );
    const colorForNode: string = this.colorForNode(result.nodeId);
    this.mmpService.highlightNode(result.nodeId, colorForNode, false);
  }

  /**
   * Ensure client exists in color mapping
   */
  private ensureClientInMapping(clientId: string): void {
    if (!this.colorMapping[clientId]) {
      this.colorMapping[clientId] = { color: DEFAULT_COLOR, nodeId: '' };
      this.extractClientListForSubscriber();
    }
  }

  /**
   * Update client's selected node in mapping
   */
  private updateClientNodeSelection(
    clientId: string,
    nodeId: string,
    selected: boolean
  ): void {
    this.colorMapping[clientId].nodeId = selected ? nodeId : '';
  }

  /**
   * Setup handler for client list updates
   */
  private setupClientListHandler(): void {
    this.socket.on('clientListUpdated', (clients: ServerClientList) => {
      this.updateColorMapping(clients);
      this.extractClientListForSubscriber();
    });
  }

  /**
   * Update color mapping from server client list
   */
  private updateColorMapping(clients: ServerClientList): void {
    this.colorMapping = Object.keys(clients).reduce<ClientColorMapping>(
      (acc: ClientColorMapping, key: string) => {
        acc[key] = {
          nodeId: this.colorMapping[key]?.nodeId || '',
          color: key === this.socket.id ? DEFAULT_SELF_COLOR : clients[key],
        };
        return acc;
      },
      {}
    );
  }

  /**
   * Setup handler for client disconnection
   */
  private setupClientDisconnectHandler(): void {
    this.socket.on('clientDisconnect', (clientId: string) => {
      delete this.colorMapping[clientId];
      this.extractClientListForSubscriber();
    });
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEventHandlers(): void {
    this.socket.on('disconnect', () => {
      this.setConnectionStatusSubject('disconnected');
    });
  }

  // ─── Socket.io error handling ────────────────────────────────

  /**
   * Validate ServerMap structure at runtime
   * Ensures fullMapState has required properties before using
   */
  private isValidServerMap(map: unknown): map is ServerMap {
    if (!map || typeof map !== 'object') return false;

    const serverMap = map as ServerMap;

    return (
      typeof serverMap.uuid === 'string' &&
      serverMap.uuid.length > 0 &&
      Array.isArray(serverMap.data) &&
      serverMap.data.length > 0 &&
      typeof serverMap.lastModified === 'string' &&
      typeof serverMap.createdAt === 'string' &&
      typeof serverMap.deletedAt === 'string' &&
      typeof serverMap.deleteAfterDays === 'number' &&
      typeof serverMap.options === 'object'
    );
  }

  /**
   * Type guard to validate error response structure at runtime
   */
  private isValidErrorResponse(
    response: OperationResponse<unknown>
  ): response is ValidationErrorResponse | CriticalErrorResponse {
    if (response.success !== false) return false;

    const errorResponse = response as
      | ValidationErrorResponse
      | CriticalErrorResponse;

    const isBasicStructureValid =
      typeof errorResponse.errorType === 'string' &&
      (errorResponse.errorType === 'validation' ||
        errorResponse.errorType === 'critical') &&
      typeof errorResponse.code === 'string' &&
      errorResponse.code.trim() !== '' &&
      typeof errorResponse.message === 'string';

    if (!isBasicStructureValid) return false;

    // Validate fullMapState if present
    if (errorResponse.fullMapState) {
      return this.isValidServerMap(errorResponse.fullMapState);
    }

    return true;
  }

  /**
   * Simplified handler for all operation responses
   * If error with fullMapState, reload from server state
   */
  private async handleOperationResponse(
    response: OperationResponse<unknown>,
    operationName: string
  ): Promise<void> {
    // Success - operation confirmed by server
    if (response.success) {
      return;
    }

    // Validate error response structure before processing
    if (!this.isValidErrorResponse(response)) {
      await this.showMalformedResponseError();
      return;
    }

    // Error occurred - reload from fullMapState if available
    if (response.fullMapState) {
      await this.handleRecoverableError(response, operationName);
    } else {
      // No fullMapState provided - show critical error
      await this.handleCriticalError(response);
    }
  }

  private async showMalformedResponseError(): Promise<void> {
    let message: string;
    try {
      message = await this.utilsService.translate(
        'TOASTS.ERRORS.MALFORMED_RESPONSE'
      );
    } catch {
      message = 'Invalid server response. Please try again.';
    }
    this.dialogService.openCriticalErrorDialog({
      code: 'MALFORMED_RESPONSE',
      message,
    });
  }

  private async handleRecoverableError(
    response: ValidationErrorResponse | CriticalErrorResponse,
    operationName: string
  ): Promise<void> {
    // Reload entire map from server's authoritative state
    this.mmpService.new(response.fullMapState.data, false);

    let message: string;
    try {
      message = await this.utilsService.translate(
        'TOASTS.ERRORS.OPERATION_FAILED_MAP_RELOADED'
      );
    } catch {
      message = 'Operation failed - map reloaded';
    }
    // Show appropriate error notification
    this.toastService.showValidationCorrection(operationName, message);
  }

  private async handleCriticalError(
    response: ValidationErrorResponse | CriticalErrorResponse
  ): Promise<void> {
    const userMessage = await this.getUserFriendlyErrorMessage(
      response.code || 'SERVER_ERROR',
      response.message || 'Unknown error'
    );

    this.dialogService.openCriticalErrorDialog({
      code: response.code || 'SERVER_ERROR',
      message: userMessage,
    });
  }

  /**
   * Convert error code to user-friendly translated message
   */
  private async getUserFriendlyErrorMessage(
    code: string,
    _messageKey: string
  ): Promise<string> {
    const errorKeyMapping: Record<string, string> = {
      NETWORK_TIMEOUT: 'TOASTS.ERRORS.NETWORK_TIMEOUT',
      SERVER_ERROR: 'TOASTS.ERRORS.SERVER_ERROR',
      AUTH_FAILED: 'TOASTS.ERRORS.AUTH_FAILED',
      MALFORMED_REQUEST: 'TOASTS.ERRORS.MALFORMED_REQUEST',
      RATE_LIMIT_EXCEEDED: 'TOASTS.ERRORS.RATE_LIMIT_EXCEEDED',
    };

    const translationKey =
      errorKeyMapping[code] || 'TOASTS.ERRORS.UNEXPECTED_ERROR';

    try {
      return await this.utilsService.translate(translationKey);
    } catch {
      return 'An error occurred. Please try again.';
    }
  }

  // ─── Yjs initialization ──────────────────────────────────────

  private initYjs(): void {
    const uuid = this.getAttachedMap().cachedMap.uuid;

    if (this.hasActiveYjsConnection(uuid)) {
      this.reattachYjsListeners();
      return;
    }

    this.resetYjs();
    this.yjsMapId = uuid;
    this.yDoc = new Y.Doc();
    this.setupYjsConnection(uuid);
    this.setupYjsConnectionStatus();
    this.setupYjsMapDeletionHandler();
    this.createYjsListeners();
  }

  private hasActiveYjsConnection(mapId: string): boolean {
    return (
      this.yDoc !== null && this.wsProvider !== null && this.yjsMapId === mapId
    );
  }

  private reattachYjsListeners(): void {
    this.createYjsListeners();
    if (this.yjsSynced) {
      this.loadMapFromYDoc();
      this.setupYjsNodesObserver();
      this.setupYjsMapOptionsObserver();
      this.setupYjsAwareness();
      this.settingsService.setEditMode(this.yjsWritable);
      this.setConnectionStatusSubject('connected');
    }
  }

  private setupYjsConnection(mapId: string): void {
    const wsUrl = this.buildYjsWsUrl();
    this.wsProvider = new WebsocketProvider(wsUrl, mapId, this.yDoc, {
      params: { secret: this.modificationSecret },
      maxBackoffTime: 5000,
      disableBc: true,
    });

    this.setupYjsWriteAccessListener();

    this.wsProvider.on('sync', (synced: boolean) => {
      if (synced && !this.yjsSynced) {
        this.handleFirstYjsSync();
      }
    });
  }

  private buildYjsWsUrl(): string {
    return buildYjsWsUrl();
  }

  private handleFirstYjsSync(): void {
    this.yjsSynced = true;
    this.loadMapFromYDoc();
    this.setupYjsNodesObserver();
    this.setupYjsMapOptionsObserver();
    this.setupYjsAwareness();
    this.settingsService.setEditMode(this.yjsWritable);
    this.setConnectionStatusSubject('connected');
  }

  private setupYjsConnectionStatus(): void {
    this.wsProvider.on(
      'status',
      (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (!this.wsProvider) return;
        if (event.status === 'connected') {
          this.setConnectionStatusSubject('connected');
        } else if (event.status === 'disconnected') {
          this.setConnectionStatusSubject('disconnected');
        }
      }
    );
  }

  private setupYjsMapDeletionHandler(): void {
    this.wsProvider.on('connection-close', (event: CloseEvent | null) => {
      if (event?.code === WS_CLOSE_MAP_DELETED) {
        window.location.reload();
      }
    });
  }

  // Listen for the server's write-access message (type 4) to set edit mode
  private setupYjsWriteAccessListener(): void {
    // Prevent "Unable to compute message" warning in y-websocket
    this.wsProvider.messageHandlers[MESSAGE_WRITE_ACCESS] = () => {
      // no-op: handled via raw WebSocket listener below
    };

    this.wsProvider.on(
      'status',
      (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (event.status !== 'connected') return;
        this.attachWriteAccessListener();
      }
    );
  }

  private attachWriteAccessListener(): void {
    const ws = this.wsProvider?.ws;
    if (!ws) return;
    ws.addEventListener('message', (event: MessageEvent) => {
      this.parseWriteAccessMessage(event);
    });
  }

  private parseWriteAccessMessage(event: MessageEvent): void {
    const data = new Uint8Array(event.data as ArrayBuffer);
    const result = parseWriteAccessBytes(data);
    if (result !== null) {
      this.yjsWritable = result;
      this.settingsService.setEditMode(this.yjsWritable);
    }
  }

  private resetYjs(): void {
    this.unsubscribeYjsListeners();
    this.detachYjsObservers();
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

  // ─── Yjs: initial map load ───────────────────────────────────

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
      nodes.push(this.yMapToNodeProps(yNode));
    });
    return nodes;
  }

  // ─── Yjs: MMP event listeners (MMP → Y.Doc) ─────────────────

  private createYjsListeners(): void {
    this.unsubscribeYjsListeners();
    this.setupYjsCreateHandler();
    this.setupYjsSelectionHandlers();
    this.setupYjsNodeUpdateHandler();
    this.setupYjsUndoRedoHandlers();
    this.setupYjsNodeCreateHandler();
    this.setupYjsPasteHandler();
    this.setupYjsNodeRemoveHandler();
  }

  private unsubscribeYjsListeners(): void {
    this.yjsSubscriptions.forEach(sub => sub.unsubscribe());
    this.yjsSubscriptions = [];
  }

  // Handles map import: clear and repopulate Y.Doc nodes
  private setupYjsCreateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
        this.attachedNodeSubject.next(this.mmpService.selectNode());
        this.updateAttachedMap();
        if (this.yjsSynced) {
          this.writeImportToYDoc();
        }
      })
    );
  }

  private setupYjsSelectionHandlers(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeSelect')
        .subscribe((nodeProps: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.updateYjsAwarenessSelection(nodeProps.id);
          this.attachedNodeSubject.next(nodeProps);
        })
    );

    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeDeselect')
        .subscribe((nodeProps: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.updateYjsAwarenessSelection(null);
          this.attachedNodeSubject.next(nodeProps);
        })
    );
  }

  private setupYjsNodeUpdateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
        if (!this.yDoc) return;
        this.attachedNodeSubject.next(result.nodeProperties);
        this.writeNodeUpdateToYDoc(result);
        this.updateAttachedMap();
      })
    );
  }

  private setupYjsUndoRedoHandlers(): void {
    this.yjsSubscriptions.push(
      this.mmpService.on('undo').subscribe((diff?: MapDiff) => {
        if (!this.yDoc) return;
        this.attachedNodeSubject.next(this.mmpService.selectNode());
        this.updateAttachedMap();
        this.writeUndoRedoDiffToYDoc(diff);
      })
    );

    this.yjsSubscriptions.push(
      this.mmpService.on('redo').subscribe((diff?: MapDiff) => {
        if (!this.yDoc) return;
        this.attachedNodeSubject.next(this.mmpService.selectNode());
        this.updateAttachedMap();
        this.writeUndoRedoDiffToYDoc(diff);
      })
    );
  }

  private setupYjsNodeCreateHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeCreate')
        .subscribe((newNode: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.writeNodeCreateToYDoc(newNode);
          this.updateAttachedMap();
          this.mmpService.selectNode(newNode.id);
          this.mmpService.editNode();
        })
    );
  }

  private setupYjsPasteHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodePaste')
        .subscribe((newNodes: ExportNodeProperties[]) => {
          if (!this.yDoc) return;
          this.writeNodesPasteToYDoc(newNodes);
          this.updateAttachedMap();
        })
    );
  }

  private setupYjsNodeRemoveHandler(): void {
    this.yjsSubscriptions.push(
      this.mmpService
        .on('nodeRemove')
        .subscribe((removedNode: ExportNodeProperties) => {
          if (!this.yDoc) return;
          this.writeNodeRemoveFromYDoc(removedNode.id);
          this.updateAttachedMap();
        })
    );
  }

  // ─── Yjs: write operations (MMP → Y.Doc) ────────────────────

  private writeNodeCreateToYDoc(nodeProps: ExportNodeProperties): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    const yNode = new Y.Map<unknown>();
    this.populateYMapFromNodeProps(yNode, nodeProps);
    nodesMap.set(nodeProps.id, yNode);
  }

  private writeNodeUpdateToYDoc(event: NodeUpdateEvent): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    const yNode = nodesMap.get(event.nodeProperties.id);
    if (!yNode) return;

    const topLevelKey = NodePropertyMapping[event.changedProperty][0];
    const value =
      event.nodeProperties[topLevelKey as keyof ExportNodeProperties];
    yNode.set(topLevelKey, value);
  }

  private writeNodeRemoveFromYDoc(nodeId: string): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    nodesMap.delete(nodeId);
  }

  private writeNodesPasteToYDoc(nodes: ExportNodeProperties[]): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    this.yDoc.transact(() => {
      for (const node of nodes) {
        const yNode = new Y.Map<unknown>();
        this.populateYMapFromNodeProps(yNode, node);
        nodesMap.set(node.id, yNode);
      }
    });
  }

  private writeImportToYDoc(): void {
    const snapshot = this.mmpService.exportAsJSON();
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;

    this.yDoc.transact(() => {
      this.clearAndRepopulateNodes(nodesMap, snapshot);
    });
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
      this.populateYMapFromNodeProps(yNode, node);
      nodesMap.set(node.id, yNode);
    }
  }

  private writeUndoRedoDiffToYDoc(diff: MapDiff): void {
    if (!diff) return;
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;

    this.yDoc.transact(() => {
      this.writeAddedNodesToYDoc(nodesMap, diff.added);
      this.writeUpdatedNodesToYDoc(nodesMap, diff.updated);
      this.writeDeletedNodesFromYDoc(nodesMap, diff.deleted);
    });
  }

  private writeAddedNodesToYDoc(
    nodesMap: Y.Map<Y.Map<unknown>>,
    added: SnapshotChanges
  ): void {
    if (!added) return;
    for (const nodeId in added) {
      const nodeProps = added[nodeId] as ExportNodeProperties;
      const yNode = new Y.Map<unknown>();
      this.populateYMapFromNodeProps(yNode, nodeProps);
      nodesMap.set(nodeId, yNode);
    }
  }

  private writeUpdatedNodesToYDoc(
    nodesMap: Y.Map<Y.Map<unknown>>,
    updated: SnapshotChanges
  ): void {
    if (!updated) return;
    for (const nodeId in updated) {
      const yNode = nodesMap.get(nodeId);
      if (!yNode) continue;
      this.applyPropertyUpdatesToYMap(yNode, updated[nodeId]);
    }
  }

  private applyPropertyUpdatesToYMap(
    yNode: Y.Map<unknown>,
    updates: Partial<ExportNodeProperties>
  ): void {
    if (!updates) return;
    for (const key in updates) {
      yNode.set(key, (updates as Record<string, unknown>)[key]);
    }
  }

  private writeDeletedNodesFromYDoc(
    nodesMap: Y.Map<Y.Map<unknown>>,
    deleted: SnapshotChanges
  ): void {
    if (!deleted) return;
    for (const nodeId in deleted) {
      nodesMap.delete(nodeId);
    }
  }

  private writeMapOptionsToYDoc(options?: CachedMapOptions): void {
    if (!this.yDoc || !options) return;
    const optionsMap = this.yDoc.getMap('mapOptions');
    optionsMap.set('fontMaxSize', options.fontMaxSize);
    optionsMap.set('fontMinSize', options.fontMinSize);
    optionsMap.set('fontIncrement', options.fontIncrement);
  }

  private async deleteMapViaHttp(adminId: string): Promise<void> {
    const mapId = this.getAttachedMap().cachedMap.uuid;
    await this.httpService.delete(
      API_URL.ROOT,
      `/maps/${mapId}`,
      JSON.stringify({ adminId })
    );
  }

  // ─── Yjs: Y.Doc observers (Y.Doc → MMP) ─────────────────────

  private detachYjsObservers(): void {
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

  private setupYjsNodesObserver(): void {
    const nodesMap = this.yDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
    this.yjsNodesObserver = (
      events: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>[],
      transaction: Y.Transaction
    ) => {
      if (transaction.local) return;
      for (const event of events) {
        this.handleYjsNodeEvent(event, nodesMap);
      }
    };
    nodesMap.observeDeep(this.yjsNodesObserver);
  }

  private handleYjsNodeEvent(
    event: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>,
    nodesMap: Y.Map<Y.Map<unknown>>
  ): void {
    if (event.target === nodesMap) {
      this.handleTopLevelNodeChanges(event, nodesMap);
    } else {
      this.handleNodePropertyChanges(event);
    }
  }

  // Handles node add/delete/update from the top-level nodes map
  private handleTopLevelNodeChanges(
    event: Y.YEvent<Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>>,
    nodesMap: Y.Map<Y.Map<unknown>>
  ): void {
    const mapEvent = event as unknown as Y.YMapEvent<Y.Map<unknown>>;
    mapEvent.keysChanged.forEach(key => {
      const change = mapEvent.changes.keys.get(key);
      if (!change) return;

      if (change.action === 'add') {
        this.applyRemoteNodeAdd(nodesMap.get(key));
      } else if (change.action === 'update') {
        this.applyRemoteNodeDelete(key);
        this.applyRemoteNodeAdd(nodesMap.get(key));
      } else if (change.action === 'delete') {
        this.applyRemoteNodeDelete(key);
      }
    });
  }

  // Handles property changes on individual node Y.Maps
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
    const nodeProps = this.yMapToNodeProps(yNode);
    this.mmpService.addNodesFromServer([nodeProps]);
  }

  private applyRemoteNodeDelete(nodeId: string): void {
    if (this.mmpService.existNode(nodeId)) {
      this.mmpService.removeNode(nodeId, false);
    }
  }

  // Applies a Y.Doc property change to MMP
  private applyYDocPropertyToMmp(
    nodeId: string,
    yjsKey: string,
    value: unknown
  ): void {
    for (const update of resolveMmpPropertyUpdate(yjsKey, value)) {
      this.mmpService.updateNode(update.prop, update.val, false, false, nodeId);
    }
  }

  private setupYjsMapOptionsObserver(): void {
    const optionsMap = this.yDoc.getMap('mapOptions');
    this.yjsOptionsObserver = (_: unknown, transaction: Y.Transaction) => {
      if (transaction.local) return;
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

  // ─── Yjs: Awareness (presence, selection, client list) ───────

  private setupYjsAwareness(): void {
    const awareness = this.wsProvider.awareness;
    const color = this.resolveClientColor(awareness);
    this.clientColor = color;

    awareness.setLocalStateField('user', {
      color,
      selectedNodeId: null,
    });

    this.yjsAwarenessHandler = () => {
      this.updateFromAwareness();
    };
    awareness.on('change', this.yjsAwarenessHandler);
  }

  // Pick a color that doesn't collide with other clients
  private resolveClientColor(
    awareness: WebsocketProvider['awareness']
  ): string {
    const usedColors = new Set<string>();
    for (const [, state] of awareness.getStates()) {
      if (state?.user?.color) usedColors.add(state.user.color);
    }
    return resolveClientColor(this.clientColor, usedColors);
  }

  private updateYjsAwarenessSelection(nodeId: string | null): void {
    if (!this.wsProvider) return;
    this.wsProvider.awareness.setLocalStateField('user', {
      color: this.clientColor,
      selectedNodeId: nodeId,
    });
  }

  // Rebuild client list and highlights from awareness states
  private updateFromAwareness(): void {
    const newMapping = this.buildColorMappingFromAwareness();
    const affectedNodes = this.findAffectedNodes(newMapping);
    this.colorMapping = newMapping;
    this.rehighlightNodes(affectedNodes);
    this.extractClientListForSubscriber();
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

  // Collect node IDs that need re-highlighting
  private findAffectedNodes(newMapping: ClientColorMapping): Set<string> {
    return findAffectedNodes(this.colorMapping, newMapping);
  }

  private rehighlightNodes(nodeIds: Set<string>): void {
    for (const nodeId of nodeIds) {
      if (!this.mmpService.existNode(nodeId)) continue;
      const color = this.colorForNode(nodeId);
      this.mmpService.highlightNode(nodeId, color, false);
    }
  }

  // ─── Y.Doc conversion utilities ──────────────────────────────

  private populateYMapFromNodeProps(
    yNode: Y.Map<unknown>,
    nodeProps: ExportNodeProperties
  ): void {
    populateYMapFromNodeProps(yNode, nodeProps);
  }

  private yMapToNodeProps(yNode: Y.Map<unknown>): ExportNodeProperties {
    return yMapToNodeProps(yNode);
  }

  // ─── Shared utilities ────────────────────────────────────────

  private setConnectionStatusSubject(value: ConnectionStatus) {
    this.connectionStatusSubject.next(value);
  }

  private colorForNode(nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId);
    return matchingClient ? this.colorMapping[matchingClient].color : '';
  }

  private clientForNode(nodeId: string): string {
    return Object.keys(this.colorMapping)
      .filter((key: string) => this.colorMapping[key]?.nodeId === nodeId)
      .shift();
  }

  private extractClientListForSubscriber(): void {
    this.clientListSubject.next(
      Object.values(this.colorMapping).map(
        (e: ClientColorMappingValue) => e?.color
      )
    );
  }

  /**
   * Store private map data locally for admin access
   */
  private storePrivateMapData(privateServerMap: PrivateServerMap): void {
    const serverMap = privateServerMap.map;
    this.storageService.set(serverMap.uuid, {
      adminId: privateServerMap.adminId,
      modificationSecret: privateServerMap.modificationSecret,
      ttl: serverMap.deletedAt,
      rootName: serverMap.data[0].name,
      createdAt: serverMap.createdAt,
    });
  }

  /**
   * Setup state for newly created map
   */
  private setupNewMapState(privateServerMap: PrivateServerMap): void {
    this.prepareMap(privateServerMap.map);
    this.settingsService.setEditMode(true);
    this.modificationSecret = privateServerMap.modificationSecret;
  }

  private async fetchMapFromServer(id: string): Promise<ServerMap> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps/' + id);
    if (!response.ok) return null;
    const json: ServerMap = await response.json();
    return json;
  }

  private async postMapToServer(): Promise<PrivateServerMap> {
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/maps/',
      JSON.stringify({
        rootNode:
          this.settingsService.getCachedUserSettings().mapOptions.rootNode,
      })
    );

    return response.json();
  }

  /**
   * Return the key of the map in the storage
   */
  private createKey(uuid: string): string {
    return `map-${uuid}`;
  }

  /**
   * Converts server map
   */
  private convertServerMapToMmp(serverMap: ServerMap): MapProperties {
    return Object.assign({}, serverMap, {
      lastModified: Date.parse(serverMap.lastModified),
      deletedAt: Date.parse(serverMap.deletedAt),
      createdAt: Date.parse(serverMap.createdAt),
    });
  }

  private prepareMap(serverMap: ServerMap) {
    const mapKey = this.createKey(serverMap.uuid);
    const mapProps = this.convertServerMapToMmp(serverMap);
    this.attachMap({
      key: mapKey,
      cachedMap: { ...mapProps, ...{ options: serverMap.options } },
    });
    this.mmpService.updateAdditionalMapOptions(serverMap.options);
  }

  private async updateCachedMapForAdmin(serverMap: ServerMap) {
    const map: CachedAdminMapValue | null = (await this.storageService.get(
      serverMap.uuid
    )) as CachedAdminMapValue | null;
    if (map) {
      map.ttl = new Date(serverMap.deletedAt);
      map.rootName = serverMap.data?.[0]?.name;
      this.storageService.set(serverMap.uuid, map);
    }
  }
}

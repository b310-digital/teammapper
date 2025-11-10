import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
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
import { MapDiff } from '@mmp/map/handlers/history';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';

const DEFAULT_COLOR = '#000000';
const DEFAULT_SELF_COLOR = '#c0c0c0';

type ClientColorMapping = Record<string, ClientColorMappingValue>;

interface ClientColorMappingValue {
  nodeId: string;
  color: string;
}

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

  private socket: Socket;
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

  ngOnDestroy() {
    this.reset();
  }

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

  // In case the component is destroyed or will be reinitialized it is important to reset state
  // that might cause problems or performance issues, e.g. removing listeners, cleanup state.
  // The current map is used inside the settings component and should stay therefore as it was.
  public reset() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.leaveMap();
    }
    this.colorMapping = {};
  }

  public initMap() {
    this.mmpService.new(this.getAttachedMap().cachedMap.data);
    this.attachedNodeSubject.next(
      this.mmpService.selectNode(this.mmpService.getRootNode().id)
    );

    this.createMapListeners();
    this.listenServerEvents(this.getAttachedMap().cachedMap.uuid);
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

  private setConnectionStatusSubject(value: ConnectionStatus) {
    this.connectionStatusSubject.next(value);
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

  public async joinMap(mmpUuid: string, color: string): Promise<MapProperties> {
    return await new Promise<MapProperties>(
      (
        resolve: (value: MapProperties) => void,
        reject: (reason: string) => void
      ) => {
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
      }
    );
  }

  public leaveMap() {
    this.socket.emit('leave');
  }

  public addNode(newNode: ExportNodeProperties) {
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
  public addNodes(newNodes: ExportNodeProperties[]) {
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
  public updateNode(nodeUpdate: NodeUpdateEvent) {
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
  public removeNode(removedNode: ExportNodeProperties) {
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
  public applyMapChangesByDiff(diff: MapDiff, operationType: 'undo' | 'redo') {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();

    // Emit with acknowledgment callback for error handling
    this.socket.emit(
      'applyMapChangesByDiff',
      {
        mapId: cachedMapEntry.cachedMap.uuid,
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

  public updateMap() {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMap', {
      mapId: cachedMapEntry.cachedMap.uuid,
      map: cachedMapEntry.cachedMap,
      modificationSecret: this.modificationSecret,
    });
  }

  public updateMapOptions(options?: CachedMapOptions) {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMapOptions', {
      mapId: cachedMapEntry.cachedMap.uuid,
      options,
      modificationSecret: this.modificationSecret,
    });
  }

  public async deleteMap(adminId: string): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    const body: { adminId: string; mapId: string } = {
      adminId,
      mapId: cachedMapEntry.cachedMap.uuid,
    };
    this.socket.emit('deleteMap', body);
  }

  public async updateNodeSelection(id: string, selected: boolean) {
    // Remember all clients selections with the dedicated colors to switch between colors when clients change among nodes
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

  private async fetchMapFromServer(id: string): Promise<ServerMap> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps/' + id);
    if (!response.ok) return null;
    const json: ServerMap = await response.json();
    return json;
  }

  public async fetchUserMapsFromServer(): Promise<CachedAdminMapEntry[]> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps');
    if (!response.ok) return [];
    const json: ServerMapInfo[] = await response.json();
    const mapEntries: CachedAdminMapEntry[] = json.map(map => ({
      id: map.uuid,
      cachedAdminMapValue: {
        adminId: map.adminId,
        modificationSecret: map.modificationSecret,
        ttl: map.ttl ? new Date(map.ttl) : new Date(),
        rootName: map.rootName,
      },
    }));
    return mapEntries;
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

    const toastHandlers = {
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
      const removedNodeId = result.nodeId;
      if (this.mmpService.existNode(removedNodeId)) {
        this.mmpService.removeNode(removedNodeId, false);
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
    const { added, updated, deleted } = diff;

    this.applyAddedNodes(added);
    this.applyUpdatedNodes(updated);
    this.applyDeletedNodes(deleted);
  }

  /**
   * Apply added nodes from diff
   */
  private applyAddedNodes(added: unknown): void {
    if (added && typeof added === 'object') {
      for (const nodeId in added) {
        const node = added[nodeId];
        this.mmpService.addNode(node, false);
      }
    }
  }

  /**
   * Apply updated nodes from diff
   */
  private applyUpdatedNodes(updated: unknown): void {
    if (updated && typeof updated === 'object') {
      for (const nodeId in updated) {
        const node = updated[nodeId];
        if (this.mmpService.existNode(nodeId)) {
          this.applyNodePropertyUpdates(nodeId, node);
        }
      }
    }
  }

  /**
   * Apply property updates to a single node
   */
  private applyNodePropertyUpdates(nodeId: string, nodeUpdates: unknown): void {
    if (typeof nodeUpdates !== 'object' || !nodeUpdates) return;

    for (const property in nodeUpdates as Record<string, unknown>) {
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
      const nestedMapping = mapping[subProperty];
      return {
        clientProperty: nestedMapping,
        directValue: value[subProperty],
      };
    }

    return;
  }

  /**
   * Apply deleted nodes from diff
   */
  private applyDeletedNodes(deleted: unknown): void {
    if (deleted && typeof deleted === 'object') {
      for (const nodeId in deleted) {
        if (this.mmpService.existNode(nodeId)) {
          this.mmpService.removeNode(nodeId, false);
        }
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

  private colorForNode(nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId);
    return matchingClient ? this.colorMapping[matchingClient].color : '';
  }

  private clientForNode(nodeId: string): string {
    return Object.keys(this.colorMapping)
      .filter((key: string) => {
        return this.colorMapping[key]?.nodeId === nodeId;
      })
      .shift();
  }

  private extractClientListForSubscriber(): void {
    this.clientListSubject.next(
      Object.values(this.colorMapping).map(
        (e: ClientColorMappingValue) => e?.color
      )
    );
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
      let malformedResponseMessage: string;
      try {
        malformedResponseMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.MALFORMED_RESPONSE'
        );
      } catch {
        malformedResponseMessage = 'Invalid server response. Please try again.';
      }
      this.dialogService.openCriticalErrorDialog({
        code: 'MALFORMED_RESPONSE',
        message: malformedResponseMessage,
      });
      return;
    }

    // Error occurred - reload from fullMapState if available
    if (response.fullMapState) {
      // Reload entire map from server's authoritative state
      this.mmpService.new(response.fullMapState.data, false);

      // Show appropriate error notification
      let operationFailedMessage: string;
      try {
        operationFailedMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.OPERATION_FAILED_MAP_RELOADED'
        );
      } catch {
        operationFailedMessage = 'Operation failed - map reloaded';
      }
      this.toastService.showValidationCorrection(
        `${operationName}`,
        operationFailedMessage
      );
    } else {
      // No fullMapState provided - show critical error
      const userMessage = await this.getUserFriendlyErrorMessage(
        response.code || 'SERVER_ERROR',
        response.message || 'Unknown error'
      );

      this.dialogService.openCriticalErrorDialog({
        code: response.code || 'SERVER_ERROR',
        message: userMessage,
      });
    }
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

  private createMapListeners() {
    // create is NOT called by the mmp lib for initial map load / and call, but for _imported_ maps
    this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());

      this.updateAttachedMap();
      this.updateMap();
    });

    this.mmpService
      .on('nodeSelect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, true);
        this.attachedNodeSubject.next(nodeProps);
      });

    this.mmpService
      .on('nodeDeselect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, false);
        this.attachedNodeSubject.next(nodeProps);
      });

    this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
      this.attachedNodeSubject.next(result.nodeProperties);
      this.updateNode(result);
      this.updateAttachedMap();
    });

    this.mmpService.on('undo').subscribe((diff?: MapDiff) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      // Updating the attached map is important because this persists changes after refresh
      this.updateAttachedMap();
      this.applyMapChangesByDiff(diff, 'undo');
    });

    this.mmpService.on('redo').subscribe((diff?: MapDiff) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      // Updating the attached map is important because this persists changes after refresh
      this.updateAttachedMap();
      this.applyMapChangesByDiff(diff, 'redo');
    });

    this.mmpService
      .on('nodeCreate')
      .subscribe((newNode: ExportNodeProperties) => {
        // Send node creation to server for validation
        this.addNode(newNode);
        this.updateAttachedMap();
        this.mmpService.selectNode(newNode.id);
        this.mmpService.editNode();
      });

    this.mmpService
      .on('nodePaste')
      .subscribe((newNodes: ExportNodeProperties[]) => {
        // Send bulk paste operations to server for validation
        this.addNodes(newNodes);
        this.updateAttachedMap();
      });

    this.mmpService
      .on('nodeRemove')
      .subscribe((removedNode: ExportNodeProperties) => {
        // Send node removal to server for validation
        this.removeNode(removedNode);
        this.updateAttachedMap();
      });
  }
}

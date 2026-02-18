import { io, Socket } from 'socket.io-client';
import { NodePropertyMapping } from '@mmp/index';
import {
  ExportNodeProperties,
  MapCreateEvent,
  MapProperties,
  NodeUpdateEvent,
} from '@mmp/map/types';
import {
  ResponseMapUpdated,
  ResponseUndoRedoChanges,
  ResponseMapOptionsUpdated,
  ResponseNodesAdded,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseSelectionUpdated,
  ResponseClientNotification,
  OperationResponse,
  ReversePropertyMapping,
} from './server-types';
import { MmpService } from '../mmp/mmp.service';
import { UtilsService } from '../utils/utils.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { MapDiff, SnapshotChanges } from '@mmp/map/handlers/history';
import { CachedMapOptions } from '../../../shared/models/cached-map.model';
import { ClientColorMapping } from './yjs-utils';
import {
  MapSyncContext,
  DEFAULT_COLOR,
  DEFAULT_SELF_COLOR,
} from './map-sync-context';
import { MapSyncErrorHandler } from './map-sync-error-handler';
import { SyncStrategy } from './sync-strategy';

type ServerClientList = Record<string, string>;

export class SocketIoSyncService implements SyncStrategy {
  private socket: Socket;

  constructor(
    private ctx: MapSyncContext,
    private mmpService: MmpService,
    private settingsService: SettingsService,
    private utilsService: UtilsService,
    private toastrService: ToastrService,
    private errorHandler: MapSyncErrorHandler
  ) {}

  // ─── Connection ─────────────────────────────────────────────

  connect(): void {
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

  detach(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.leaveMap();
    }
  }

  destroy(): void {
    this.detach();
  }

  initMap(uuid: string): void {
    this.createListeners();
    this.listenServerEvents(uuid);
  }

  undo(): void {
    this.mmpService.undo();
    this.updateCanUndoRedo();
  }

  redo(): void {
    this.mmpService.redo();
    this.updateCanUndoRedo();
  }

  updateMapOptions(options?: CachedMapOptions): void {
    const cachedMapEntry = this.ctx.getAttachedMap();
    this.socket.emit('updateMapOptions', {
      mapId: cachedMapEntry.cachedMap.uuid,
      options,
      modificationSecret: this.ctx.getModificationSecret(),
    });
  }

  async deleteMap(adminId: string): Promise<void> {
    const cachedMapEntry = this.ctx.getAttachedMap();
    this.socket.emit('deleteMap', {
      adminId,
      mapId: cachedMapEntry.cachedMap.uuid,
    });
  }

  // ─── MMP event listeners (MMP → Socket.io) ─────────────────

  private createListeners(): void {
    this.setupCreateHandler();
    this.setupSelectionHandlers();
    this.setupNodeUpdateHandler();
    this.setupUndoRedoHandlers();
    this.setupNodeCreateHandler();
    this.setupPasteHandler();
    this.setupNodeRemoveHandler();
  }

  private setupCreateHandler(): void {
    this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
      this.ctx.setAttachedNode(this.mmpService.selectNode());
      this.ctx.updateAttachedMap();
      this.updateMap();
    });
  }

  private setupSelectionHandlers(): void {
    this.mmpService
      .on('nodeSelect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, true);
        this.ctx.setAttachedNode(nodeProps);
      });

    this.mmpService
      .on('nodeDeselect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, false);
        this.ctx.setAttachedNode(nodeProps);
      });
  }

  private setupNodeUpdateHandler(): void {
    this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
      this.ctx.setAttachedNode(result.nodeProperties);
      this.emitUpdateNode(result);
      this.ctx.updateAttachedMap();
    });
  }

  private setupUndoRedoHandlers(): void {
    this.mmpService.on('undo').subscribe((diff?: MapDiff) => {
      this.ctx.setAttachedNode(this.mmpService.selectNode());
      this.ctx.updateAttachedMap();
      this.emitApplyMapChangesByDiff(diff, 'undo');
      this.updateCanUndoRedo();
    });

    this.mmpService.on('redo').subscribe((diff?: MapDiff) => {
      this.ctx.setAttachedNode(this.mmpService.selectNode());
      this.ctx.updateAttachedMap();
      this.emitApplyMapChangesByDiff(diff, 'redo');
      this.updateCanUndoRedo();
    });
  }

  private updateCanUndoRedo(): void {
    if (typeof this.mmpService.history !== 'function') return;
    const history = this.mmpService.history();
    const hasHistory = history?.snapshots?.length > 1;
    this.ctx.setCanUndo(hasHistory);
    this.ctx.setCanRedo(hasHistory);
  }

  private setupNodeCreateHandler(): void {
    this.mmpService
      .on('nodeCreate')
      .subscribe((newNode: ExportNodeProperties) => {
        this.emitAddNode(newNode);
        this.ctx.updateAttachedMap();
        this.mmpService.selectNode(newNode.id);
        this.mmpService.editNode();
      });
  }

  private setupPasteHandler(): void {
    this.mmpService
      .on('nodePaste')
      .subscribe((newNodes: ExportNodeProperties[]) => {
        this.emitAddNodes(newNodes);
        this.ctx.updateAttachedMap();
      });
  }

  private setupNodeRemoveHandler(): void {
    this.mmpService
      .on('nodeRemove')
      .subscribe((removedNode: ExportNodeProperties) => {
        this.emitRemoveNode(removedNode);
        this.ctx.updateAttachedMap();
      });
  }

  // ─── Socket.io emit methods ─────────────────────────────────

  private joinMap(mmpUuid: string, color: string): Promise<MapProperties> {
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

  private leaveMap(): void {
    this.socket.emit('leave');
  }

  private emitAddNode(newNode: ExportNodeProperties): void {
    this.socket.emit(
      'addNodes',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        nodes: [newNode],
        modificationSecret: this.ctx.getModificationSecret(),
      },
      async (response: OperationResponse<ExportNodeProperties[]>) => {
        await this.handleOperationResponse(response, 'add node');
      }
    );
  }

  private emitAddNodes(newNodes: ExportNodeProperties[]): void {
    this.socket.emit(
      'addNodes',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        nodes: newNodes,
        modificationSecret: this.ctx.getModificationSecret(),
      },
      async (response: OperationResponse<ExportNodeProperties[]>) => {
        await this.handleOperationResponse(response, 'add nodes');
      }
    );
  }

  private emitUpdateNode(nodeUpdate: NodeUpdateEvent): void {
    this.socket.emit(
      'updateNode',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        node: nodeUpdate.nodeProperties,
        updatedProperty: nodeUpdate.changedProperty,
        modificationSecret: this.ctx.getModificationSecret(),
      },
      async (response: OperationResponse<ExportNodeProperties>) => {
        await this.handleOperationResponse(response, 'update node');
      }
    );
  }

  private emitRemoveNode(removedNode: ExportNodeProperties): void {
    this.socket.emit(
      'removeNode',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        node: removedNode,
        modificationSecret: this.ctx.getModificationSecret(),
      },
      async (response: OperationResponse<ExportNodeProperties | null>) => {
        await this.handleOperationResponse(response, 'remove node');
      }
    );
  }

  private emitApplyMapChangesByDiff(
    diff: MapDiff,
    operationType: 'undo' | 'redo'
  ): void {
    this.socket.emit(
      'applyMapChangesByDiff',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        diff,
        modificationSecret: this.ctx.getModificationSecret(),
      },
      async (response: OperationResponse<MapDiff>) => {
        await this.handleOperationResponse(
          response,
          `${operationType} operation`
        );
      }
    );
  }

  private updateMap(): void {
    const cachedMapEntry = this.ctx.getAttachedMap();
    this.socket.emit('updateMap', {
      mapId: cachedMapEntry.cachedMap.uuid,
      map: cachedMapEntry.cachedMap,
      modificationSecret: this.ctx.getModificationSecret(),
    });
  }

  private updateNodeSelection(id: string, selected: boolean): void {
    const mapping = this.ctx.getColorMapping();
    this.ctx.setColorMapping({
      ...mapping,
      [this.socket.id]: {
        color: DEFAULT_SELF_COLOR,
        nodeId: selected ? id : '',
      },
    });

    if (!selected) {
      const colorForNode = this.ctx.colorForNode(id);
      if (colorForNode !== '')
        this.mmpService.highlightNode(id, colorForNode, false);
    }

    this.socket.emit('updateNodeSelection', {
      mapId: this.ctx.getAttachedMap().cachedMap.uuid,
      nodeId: id,
      selected,
    });
  }

  private checkModificationSecret(): void {
    this.socket.emit(
      'checkModificationSecret',
      {
        mapId: this.ctx.getAttachedMap().cachedMap.uuid,
        modificationSecret: this.ctx.getModificationSecret(),
      },
      (result: boolean) => this.settingsService.setEditMode(result)
    );
  }

  // ─── Server event handlers ──────────────────────────────────

  private listenServerEvents(uuid: string): Promise<MapProperties> {
    this.checkModificationSecret();
    this.setupReconnectionHandler(uuid);
    this.setupNotificationHandlers();
    this.setupNodeEventHandlers();
    this.setupMapEventHandlers();
    this.setupClientEventHandlers();
    this.setupConnectionEventHandlers();

    return this.joinMap(uuid, this.ctx.getClientColor());
  }

  private setupReconnectionHandler(uuid: string): void {
    this.socket.io.on('reconnect', async () => {
      const serverMap = await this.joinMap(uuid, this.ctx.getClientColor());
      this.ctx.setConnectionStatus('connected');
      this.mmpService.new(serverMap.data, false);
    });
  }

  private setupNotificationHandlers(): void {
    this.socket.on(
      'clientNotification',
      async (notification: ResponseClientNotification) => {
        if (notification.clientId === this.socket.id) return;
        await this.handleClientNotification(notification);
      }
    );
  }

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

  private setupNodeEventHandlers(): void {
    this.setupNodesAddedHandler();
    this.setupNodeUpdatedHandler();
    this.setupNodeRemovedHandler();
  }

  private setupNodesAddedHandler(): void {
    this.socket.on('nodesAdded', (result: ResponseNodesAdded) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.addNodesFromServer(result.nodes);
    });
  }

  private setupNodeUpdatedHandler(): void {
    this.socket.on('nodeUpdated', (result: ResponseNodeUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.handleNodeUpdate(result);
    });
  }

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

  private setupNodeRemovedHandler(): void {
    this.socket.on('nodeRemoved', (result: ResponseNodeRemoved) => {
      if (result.clientId === this.socket.id) return;
      if (this.mmpService.existNode(result.nodeId)) {
        this.mmpService.removeNode(result.nodeId, false);
      }
    });
  }

  private setupMapEventHandlers(): void {
    this.setupMapUpdatedHandler();
    this.setupMapChangesHandler();
    this.setupMapOptionsHandler();
    this.setupMapDeletedHandler();
  }

  private setupMapUpdatedHandler(): void {
    this.socket.on('mapUpdated', (result: ResponseMapUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.new(result.map.data, false);
    });
  }

  private setupMapChangesHandler(): void {
    this.socket.on('mapChangesUndoRedo', (result: ResponseUndoRedoChanges) => {
      if (result.clientId === this.socket.id) return;
      this.applyMapDiff(result.diff);
    });
  }

  private applyMapDiff(diff: MapDiff): void {
    this.applyAddedNodes(diff.added);
    this.applyUpdatedNodes(diff.updated);
    this.applyDeletedNodes(diff.deleted);
  }

  private applyAddedNodes(added: SnapshotChanges): void {
    if (!added) return;
    for (const nodeId in added) {
      this.mmpService.addNode(added[nodeId], false);
    }
  }

  private applyUpdatedNodes(updated: SnapshotChanges): void {
    if (!updated) return;
    for (const nodeId in updated) {
      if (this.mmpService.existNode(nodeId)) {
        this.applyNodePropertyUpdates(nodeId, updated[nodeId]);
      }
    }
  }

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

  private applyDeletedNodes(deleted: SnapshotChanges): void {
    if (!deleted) return;
    for (const nodeId in deleted) {
      if (this.mmpService.existNode(nodeId)) {
        this.mmpService.removeNode(nodeId, false);
      }
    }
  }

  private setupMapOptionsHandler(): void {
    this.socket.on('mapOptionsUpdated', (result: ResponseMapOptionsUpdated) => {
      if (result.clientId === this.socket.id) return;
      this.mmpService.updateAdditionalMapOptions(result.options);
    });
  }

  private setupMapDeletedHandler(): void {
    this.socket.on('mapDeleted', () => {
      window.location.reload();
    });
  }

  private setupClientEventHandlers(): void {
    this.setupSelectionHandler();
    this.setupClientListHandler();
    this.setupClientDisconnectHandler();
  }

  private setupSelectionHandler(): void {
    this.socket.on('selectionUpdated', (result: ResponseSelectionUpdated) => {
      if (result.clientId === this.socket.id) return;
      if (!this.mmpService.existNode(result.nodeId)) return;
      this.handleSelectionUpdate(result);
    });
  }

  private handleSelectionUpdate(result: ResponseSelectionUpdated): void {
    this.ensureClientInMapping(result.clientId);
    this.updateClientNodeSelection(
      result.clientId,
      result.nodeId,
      result.selected
    );
    const colorForNode = this.ctx.colorForNode(result.nodeId);
    this.mmpService.highlightNode(result.nodeId, colorForNode, false);
  }

  private ensureClientInMapping(clientId: string): void {
    const mapping = this.ctx.getColorMapping();
    if (!mapping[clientId]) {
      this.ctx.setColorMapping({
        ...mapping,
        [clientId]: { color: DEFAULT_COLOR, nodeId: '' },
      });
      this.ctx.emitClientList();
    }
  }

  private updateClientNodeSelection(
    clientId: string,
    nodeId: string,
    selected: boolean
  ): void {
    const mapping = this.ctx.getColorMapping();
    const client = mapping[clientId];
    if (!client) return;
    this.ctx.setColorMapping({
      ...mapping,
      [clientId]: { ...client, nodeId: selected ? nodeId : '' },
    });
  }

  private setupClientListHandler(): void {
    this.socket.on('clientListUpdated', (clients: ServerClientList) => {
      this.updateColorMapping(clients);
      this.ctx.emitClientList();
    });
  }

  private updateColorMapping(clients: ServerClientList): void {
    const currentMapping = this.ctx.getColorMapping();
    this.ctx.setColorMapping(
      Object.keys(clients).reduce<ClientColorMapping>(
        (acc: ClientColorMapping, key: string) => {
          acc[key] = {
            nodeId: currentMapping[key]?.nodeId || '',
            color: key === this.socket.id ? DEFAULT_SELF_COLOR : clients[key],
          };
          return acc;
        },
        {}
      )
    );
  }

  private setupClientDisconnectHandler(): void {
    this.socket.on('clientDisconnect', (clientId: string) => {
      const mapping = this.ctx.getColorMapping();
      const remaining = Object.keys(mapping)
        .filter(key => key !== clientId)
        .reduce<ClientColorMapping>((acc, key) => {
          acc[key] = mapping[key];
          return acc;
        }, {});
      this.ctx.setColorMapping(remaining);
      this.ctx.emitClientList();
    });
  }

  private setupConnectionEventHandlers(): void {
    this.socket.on('disconnect', () => {
      this.ctx.setConnectionStatus('disconnected');
    });
  }

  // ─── Error handling (delegated) ─────────────────────────────

  private async handleOperationResponse(
    response: OperationResponse<unknown>,
    operationName: string
  ): Promise<void> {
    return this.errorHandler.handleOperationResponse(response, operationName);
  }
}

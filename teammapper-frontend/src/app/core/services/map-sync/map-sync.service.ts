import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
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
  ResponseUndoRedoChanges,
  ReversePropertyMapping,
} from './server-types';
import { API_URL, HttpService } from '../../http/http.service';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { MapDiff } from '@mmp/map/handlers/history';

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

  public async prepareNewMap(): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.postMapToServer();
    const serverMap = privateServerMap.map;
    // store private map data locally
    this.storageService.set(serverMap.uuid, {
      adminId: privateServerMap.adminId,
      modificationSecret: privateServerMap.modificationSecret,
      ttl: serverMap.deletedAt,
      rootName: serverMap.data[0].name,
      createdAt: serverMap.createdAt,
    });

    this.prepareMap(serverMap);

    this.settingsService.setEditMode(true);
    this.modificationSecret = privateServerMap.modificationSecret;
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
      (resolve: (reason: any) => void, reject: (reason: any) => void) => {
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
    this.socket.emit('addNodes', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodes: [newNode],
      modificationSecret: this.modificationSecret,
    });
  }

  public addNodes(newNodes: ExportNodeProperties[]) {
    this.socket.emit('addNodes', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodes: newNodes,
      modificationSecret: this.modificationSecret,
    });
  }

  public updateNode(nodeUpdate: NodeUpdateEvent) {
    this.socket.emit('updateNode', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      node: nodeUpdate.nodeProperties,
      updatedProperty: nodeUpdate.changedProperty,
      modificationSecret: this.modificationSecret,
    });
  }

  public removeNode(removedNode: ExportNodeProperties) {
    this.socket.emit('removeNode', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      node: removedNode,
      modificationSecret: this.modificationSecret,
    });
  }

  public applyMapChangesByDiff(diff: MapDiff) {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('applyMapChangesByDiff', {
      mapId: cachedMapEntry.cachedMap.uuid,
      diff,
      modificationSecret: this.modificationSecret,
    });
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

  public async deleteMap(adminId: string): Promise<any> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    const body: { adminId: string; mapId: string } = {
      adminId,
      mapId: cachedMapEntry.cachedMap.uuid,
    };
    return this.socket.emit('deleteMap', body);
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

  private listenServerEvents(uuid: string): Promise<MapProperties> {
    this.checkModificationSecret();

    this.socket.io.on('reconnect', async () => {
      const serverMap: MapProperties = await this.joinMap(
        uuid,
        this.clientColor
      );

      this.setConnectionStatusSubject('connected');
      this.mmpService.new(serverMap.data, false);
    });

    this.socket.on(
      'clientNotification',
      async (notification: ResponseClientNotification) => {
        if (notification.clientId === this.socket.id) return;

        const msg = await this.utilsService.translate(notification.message);

        if (!msg) return;

        switch (notification.type) {
          case 'error':
            this.toastrService.error(msg);
            break;
          case 'success':
            this.toastrService.success(msg);
            break;
          case 'warning':
            this.toastrService.warning(msg);
            break;
        }
      }
    );

    this.socket.on('nodesAdded', (result: ResponseNodesAdded) => {
      if (result.clientId === this.socket.id) return;

      this.mmpService.addNodesFromServer(result.nodes);
    });

    this.socket.on('nodeUpdated', (result: ResponseNodeUpdated) => {
      if (result.clientId === this.socket.id) return;

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
    });

    this.socket.on('mapUpdated', (result: ResponseMapUpdated) => {
      if (result.clientId === this.socket.id) return;

      this.mmpService.new(result.map.data, false);
    });

    this.socket.on('mapChangesUndoRedo', (result: ResponseUndoRedoChanges) => {
      if (result.clientId === this.socket.id) return;

      const getClientProperty = (
        serverProperty: string,
        value: any
      ): { clientProperty: string; directValue: any } => {
        const mapping =
          ReversePropertyMapping[
            serverProperty as keyof typeof ReversePropertyMapping
          ];

        if (typeof mapping === 'string') {
          return {
            clientProperty: mapping,
            directValue: value,
          };
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
      };

      const { added, updated, deleted } = result.diff;

      // Handle added nodes
      if (added && typeof added === 'object') {
        for (const nodeId in added) {
          const node = added[nodeId];
          this.mmpService.addNode(node, false);
        }
      }

      // Handle updated nodes
      if (updated && typeof updated === 'object') {
        for (const nodeId in updated) {
          const node = updated[nodeId];
          if (this.mmpService.existNode(nodeId)) {
            for (const property in node) {
              const updatedProperty = getClientProperty(
                property,
                node[property]
              );

              this.mmpService.updateNode(
                updatedProperty.clientProperty,
                updatedProperty.directValue,
                false, // notifyWithEvent
                true, // updateHistory
                nodeId
              );
            }
          }
        }
      }

      // Handle deleted nodes
      if (deleted && typeof deleted === 'object') {
        for (const nodeId in deleted) {
          if (this.mmpService.existNode(nodeId)) {
            this.mmpService.removeNode(nodeId, false);
          }
        }
      }
    });

    this.socket.on('mapOptionsUpdated', (result: ResponseMapOptionsUpdated) => {
      if (result.clientId === this.socket.id) return;

      this.mmpService.updateAdditionalMapOptions(result.options);
    });

    this.socket.on('nodeRemoved', (result: ResponseNodeRemoved) => {
      if (result.clientId === this.socket.id) return;

      const removedNodeId = result.nodeId;
      if (this.mmpService.existNode(removedNodeId)) {
        this.mmpService.removeNode(removedNodeId, false);
      }
    });

    this.socket.on('selectionUpdated', (result: ResponseSelectionUpdated) => {
      if (result.clientId === this.socket.id) return;
      if (!this.mmpService.existNode(result.nodeId)) return;

      if (!this.colorMapping[result.clientId]) {
        this.colorMapping[result.clientId] = {
          color: DEFAULT_COLOR,
          nodeId: '',
        };
        this.extractClientListForSubscriber();
      }

      if (result.selected) {
        this.colorMapping[result.clientId].nodeId = result.nodeId;
      } else {
        this.colorMapping[result.clientId].nodeId = '';
      }
      const colorForNode: string = this.colorForNode(result.nodeId);
      this.mmpService.highlightNode(result.nodeId, colorForNode, false);
    });

    this.socket.on('clientListUpdated', (clients: ServerClientList) => {
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
      this.extractClientListForSubscriber();
    });

    this.socket.on('clientDisconnect', (clientId: string) => {
      delete this.colorMapping[clientId];
      this.extractClientListForSubscriber();
    });

    this.socket.on('disconnect', () => {
      this.setConnectionStatusSubject('disconnected');
    });

    this.socket.on('mapDeleted', () => {
      window.location.reload();
    });

    return this.joinMap(uuid, this.clientColor);
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
      this.applyMapChangesByDiff(diff);
    });

    this.mmpService.on('redo').subscribe((diff?: MapDiff) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      // Updating the attached map is important because this persists changes after refresh
      this.updateAttachedMap();
      this.applyMapChangesByDiff(diff);
    });

    this.mmpService
      .on('nodeCreate')
      .subscribe((newNode: ExportNodeProperties) => {
        this.addNode(newNode);
        this.updateAttachedMap();
        this.mmpService.selectNode(newNode.id);
        this.mmpService.editNode();
      });

    this.mmpService
      .on('nodePaste')
      .subscribe((newNodes: ExportNodeProperties[]) => {
        this.addNodes(newNodes);
        this.updateAttachedMap();
      });

    this.mmpService
      .on('nodeRemove')
      .subscribe((removedNode: ExportNodeProperties) => {
        this.removeNode(removedNode);
        this.updateAttachedMap();
      });
  }
}
